from fastapi import APIRouter, HTTPException, status

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
from tripwise_api.planning.edit import propose_edit
from tripwise_api.routes.common import metered_ai, require_trip
from tripwise_api.schemas.edits import AiEditProposal, AiEditRequest

router = APIRouter(tags=["ai edits"], dependencies=[rate_limited])


@router.post("/trips/{trip_id}/ai-edit")
async def ai_edit_day(
    trip_id: str,
    body: AiEditRequest,
    user: CurrentUser,
    repository: RepositoryDep,
    ai: AiDep,
    geocoder: GeocoderDep,
    clock: ClockDep,
    settings: SettingsDep,
    new_id: NewIdDep,
) -> AiEditProposal:
    """Propose a changed day. Nothing is saved: the browser shows the diff, and accepting it
    saves the trip like any other edit (one undoable step)."""
    trip = await require_trip(repository, user.uid, trip_id)
    if body.day_index >= trip.request.total_days:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, detail="No such day")
    if body.day.destination_index != trip.request.destination_for_day(body.day_index):
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT, detail="Wrong destination for this day"
        )
    async with metered_ai(repository, user, clock, settings) as language:
        return await propose_edit(
            ai, geocoder, trip.request, body.action, body.day_index, body.day, language, new_id
        )
