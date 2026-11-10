"""Packing list, packing templates, documents checklist and weather for a trip."""

from datetime import timedelta

from fastapi import APIRouter, Response, status

from tripwise_api.auth import CurrentUser
from tripwise_api.dependencies import ClockDep, NewIdDep, RepositoryDep, WeatherDep, rate_limited
from tripwise_api.domain.documents import default_checklist, official_links, passport_valid_until
from tripwise_api.domain.packing import build_packing_list, packing_context
from tripwise_api.integrations.weather import WeatherError, weather_kind
from tripwise_api.routes.common import not_found, require_trip
from tripwise_api.schemas.essentials import (
    DestinationWeather,
    DocumentChecklist,
    DocumentsResponse,
    PackingList,
    PackingTemplate,
    SaveTemplateRequest,
    WeatherKind,
    WeatherReport,
)

router = APIRouter(tags=["essentials"], dependencies=[rate_limited])


@router.get("/trips/{trip_id}/packing")
async def get_packing(trip_id: str, user: CurrentUser, repository: RepositoryDep) -> PackingList:
    """The saved list, or a fresh one from the packing rules (not saved until edited)."""
    trip = await require_trip(repository, user.uid, trip_id)
    saved = await repository.get_packing(user.uid, trip_id)
    if saved is not None:
        return saved
    categories = [s.category for d in trip.days for s in d.stops]
    return PackingList(items=build_packing_list(packing_context(trip.request, categories, None)))


@router.put("/trips/{trip_id}/packing")
async def save_packing(
    trip_id: str, body: PackingList, user: CurrentUser, repository: RepositoryDep
) -> PackingList:
    await require_trip(repository, user.uid, trip_id)
    await repository.save_packing(user.uid, trip_id, body)
    return body


@router.get("/packing-templates")
async def list_templates(user: CurrentUser, repository: RepositoryDep) -> list[PackingTemplate]:
    templates = await repository.list_templates(user.uid)
    return sorted(templates, key=lambda t: t.created_at, reverse=True)


@router.post("/trips/{trip_id}/packing/template", status_code=status.HTTP_201_CREATED)
async def save_as_template(
    trip_id: str,
    body: SaveTemplateRequest,
    user: CurrentUser,
    repository: RepositoryDep,
    clock: ClockDep,
    new_id: NewIdDep,
) -> PackingTemplate:
    packing = await get_packing(trip_id, user, repository)
    items = [i.model_copy(update={"checked": False}) for i in packing.items]
    template = PackingTemplate(id=new_id(), name=body.name, items=items, created_at=clock())
    await repository.save_template(user.uid, template)
    return template


@router.delete("/packing-templates/{template_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_template(
    template_id: str, user: CurrentUser, repository: RepositoryDep
) -> Response:
    if all(t.id != template_id for t in await repository.list_templates(user.uid)):
        raise not_found("Template")
    await repository.delete_template(user.uid, template_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/trips/{trip_id}/documents")
async def get_documents(
    trip_id: str, user: CurrentUser, repository: RepositoryDep
) -> DocumentsResponse:
    trip = await require_trip(repository, user.uid, trip_id)
    saved = await repository.get_documents(user.uid, trip_id)
    checklist = saved or DocumentChecklist(items=default_checklist(trip.request))
    return DocumentsResponse(
        checklist=checklist,
        official_links=official_links(trip.request),
        passport_valid_until=passport_valid_until(trip.request),
    )


@router.put("/trips/{trip_id}/documents")
async def save_documents(
    trip_id: str, body: DocumentChecklist, user: CurrentUser, repository: RepositoryDep
) -> DocumentsResponse:
    trip = await require_trip(repository, user.uid, trip_id)
    await repository.save_documents(user.uid, trip_id, body)
    return DocumentsResponse(
        checklist=body,
        official_links=official_links(trip.request),
        passport_valid_until=passport_valid_until(trip.request),
    )


@router.get("/trips/{trip_id}/weather")
async def get_weather(
    trip_id: str, user: CurrentUser, repository: RepositoryDep, weather: WeatherDep, clock: ClockDep
) -> WeatherReport:
    """Forecast inside Open-Meteo's 16-day window, else the same dates last year."""
    trip = await require_trip(repository, user.uid, trip_id)
    request = trip.request
    start = request.start_date
    end = start + timedelta(days=request.total_days - 1) if start else None
    kind = weather_kind(clock().date(), start, end)
    if kind is WeatherKind.UNAVAILABLE or start is None:
        return WeatherReport(kind=WeatherKind.UNAVAILABLE, destinations=[])
    reports: list[DestinationWeather] = []
    first = start
    try:
        for index, destination in enumerate(request.destinations):
            last = first + timedelta(days=destination.days - 1)
            days = await weather.daily(kind, destination.location, first, last)
            reports.append(DestinationWeather(destination_index=index, days=days))
            first = last + timedelta(days=1)
    except WeatherError:
        return WeatherReport(kind=WeatherKind.UNAVAILABLE, destinations=[])
    return WeatherReport(kind=kind, destinations=reports)
