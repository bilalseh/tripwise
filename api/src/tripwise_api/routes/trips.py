from fastapi import APIRouter, HTTPException, Response, status

from tripwise_api.auth import CurrentUser
from tripwise_api.dependencies import (
    AiDep,
    ClockDep,
    GeocoderDep,
    NewIdDep,
    RepositoryDep,
    SettingsDep,
    rate_limited,
)
from tripwise_api.domain.usage import can_add_trip, trip_allowance
from tripwise_api.planning.generate import plan_days
from tripwise_api.repository import Repository, VersionConflictError
from tripwise_api.routes.common import conflict, metered_ai, require_trip, tier_of
from tripwise_api.schemas.essentials import DocumentChecklist, PackingList
from tripwise_api.schemas.profile import Tier
from tripwise_api.schemas.trip import (
    CreateTripRequest,
    DuplicateTripRequest,
    GenerateRequest,
    GroundingReport,
    SaveTripRequest,
    Trip,
    TripStatus,
    TripSummary,
)

router = APIRouter(tags=["trips"], prefix="/trips", dependencies=[rate_limited])

STALE = conflict("stale_version", "This trip changed in another tab. Reload to see the latest.")


def summary_of(trip: Trip) -> TripSummary:
    return TripSummary(
        id=trip.id,
        title=trip.title,
        destinations=[d.name for d in trip.request.destinations],
        start_date=trip.request.start_date,
        total_days=trip.request.total_days,
        status=trip.status,
        stops=sum(len(d.stops) for d in trip.days),
        updated_at=trip.updated_at,
    )


async def _check_allowance(repository: Repository, user: CurrentUser) -> None:
    tier = tier_of(await repository.get_profile(user.uid))
    allowance = trip_allowance(is_pro=tier is Tier.PRO, is_demo=user.is_anonymous)
    if not can_add_trip(len(await repository.list_trips(user.uid)), allowance):
        raise conflict("trip_limit_reached", "Your plan's trip limit is reached.")


def _merge_reports(
    old: GroundingReport | None, new: GroundingReport, replace: bool
) -> GroundingReport:
    if old is None or replace:
        return new
    return GroundingReport(
        provider=new.provider,
        suggested=old.suggested + new.suggested,
        kept=old.kept + new.kept,
        dropped=[*old.dropped, *new.dropped][:60],
        trimmed=[*old.trimmed, *new.trimmed][:60],
    )


@router.get("")
async def list_trips(user: CurrentUser, repository: RepositoryDep) -> list[TripSummary]:
    trips = await repository.list_trips(user.uid)
    return [summary_of(t) for t in sorted(trips, key=lambda t: t.updated_at, reverse=True)]


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_trip(
    body: CreateTripRequest,
    user: CurrentUser,
    repository: RepositoryDep,
    clock: ClockDep,
    new_id: NewIdDep,
) -> Trip:
    """Save the wizard's answers as a draft trip; generation is a separate step."""
    await _check_allowance(repository, user)
    now = clock()
    title = body.title or " · ".join(d.name for d in body.request.destinations)
    trip = Trip(
        id=new_id(),
        title=title[:120],
        request=body.request,
        status=TripStatus.DRAFT,
        version=0,
        created_at=now,
        updated_at=now,
    )
    await repository.create_trip(user.uid, trip)
    return trip


@router.get("/{trip_id}")
async def get_trip(trip_id: str, user: CurrentUser, repository: RepositoryDep) -> Trip:
    return await require_trip(repository, user.uid, trip_id)


@router.put("/{trip_id}")
async def save_trip(
    trip_id: str,
    body: SaveTripRequest,
    user: CurrentUser,
    repository: RepositoryDep,
    clock: ClockDep,
) -> Trip:
    """Save edits (reorder, move, add, remove, lock, overrides). Rejects a stale base version."""
    trip = await require_trip(repository, user.uid, trip_id)
    if body.base_version != trip.version:
        raise STALE
    request = trip.request
    if len(body.days) > request.total_days:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT, detail="More days than the trip has"
        )
    for index, day in enumerate(body.days):
        if day.destination_index != request.destination_for_day(index):
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail=f"Day {index + 1} has the wrong destination",
            )
    ids = [s.id for d in body.days for s in (*d.stops, *d.rain_plan)]
    if len(ids) != len(set(ids)):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, detail="Stop ids must be unique")
    updated = trip.model_copy(
        update={
            "title": body.title,
            "days": body.days,
            "overrides": body.overrides,
            "version": trip.version + 1,
            "updated_at": clock(),
        }
    )
    try:
        await repository.save_trip(user.uid, updated, trip.version)
    except VersionConflictError as error:
        raise STALE from error
    return updated


@router.delete("/{trip_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_trip(trip_id: str, user: CurrentUser, repository: RepositoryDep) -> Response:
    await require_trip(repository, user.uid, trip_id)
    await repository.delete_trip(user.uid, trip_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{trip_id}/generate")
async def generate_days(
    trip_id: str,
    body: GenerateRequest,
    user: CurrentUser,
    repository: RepositoryDep,
    ai: AiDep,
    geocoder: GeocoderDep,
    clock: ClockDep,
    settings: SettingsDep,
    new_id: NewIdDep,
) -> Trip:
    """Generate (or regenerate) a batch of days, keeping any stops the user locked there."""
    trip = await require_trip(repository, user.uid, trip_id)
    total = trip.request.total_days
    first, count = body.first_day, min(body.day_count, total - body.first_day)
    if count < 1 or first > len(trip.days):
        raise conflict("bad_range", "Generate days in order, inside the trip.")
    before, after = trip.days[:first], trip.days[first + count :]
    locked = [[s for s in d.stops if s.locked] for d in trip.days[first : first + count]]
    async with metered_ai(repository, user, clock, settings) as language:
        batch = await plan_days(
            ai, geocoder, trip.request, first, count, [*before, *after], language, new_id, locked
        )
    days = [*before, *batch.days, *after]
    updated = trip.model_copy(
        update={
            "days": days,
            "status": TripStatus.READY if len(days) == total else TripStatus.DRAFT,
            "report": _merge_reports(trip.report, batch.report, replace=first == 0),
            "version": trip.version + 1,
            "updated_at": clock(),
        }
    )
    try:
        await repository.save_trip(user.uid, updated, trip.version)
    except VersionConflictError as error:
        raise STALE from error
    return updated


@router.post("/{trip_id}/duplicate", status_code=status.HTTP_201_CREATED)
async def duplicate_trip(
    trip_id: str,
    body: DuplicateTripRequest,
    user: CurrentUser,
    repository: RepositoryDep,
    clock: ClockDep,
    new_id: NewIdDep,
) -> Trip:
    """Use a trip as a template: same itinerary and lists, new dates, nothing checked off."""
    source = await require_trip(repository, user.uid, trip_id)
    await _check_allowance(repository, user)
    now = clock()
    request = source.request.model_copy(update={"start_date": body.start_date})
    copy = source.model_copy(
        update={
            "id": new_id(),
            "title": body.title or source.title,
            "request": request,
            "version": 0,
            "share_token": None,
            "created_at": now,
            "updated_at": now,
        }
    )
    await repository.create_trip(user.uid, copy)
    packing = await repository.get_packing(user.uid, trip_id)
    if packing:
        unchecked = [i.model_copy(update={"checked": False}) for i in packing.items]
        await repository.save_packing(user.uid, copy.id, PackingList(items=unchecked))
    documents = await repository.get_documents(user.uid, trip_id)
    if documents:
        shift = (
            body.start_date - source.request.start_date
            if body.start_date and source.request.start_date
            else None
        )
        items = [
            i.model_copy(
                update={
                    "done": False,
                    "due_date": i.due_date + shift if i.due_date and shift is not None else None,
                }
            )
            for i in documents.items
        ]
        await repository.save_documents(user.uid, copy.id, DocumentChecklist(items=items))
    return copy
