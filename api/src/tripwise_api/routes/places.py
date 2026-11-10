from typing import Annotated

from fastapi import APIRouter, Query

from tripwise_api.auth import CurrentUser
from tripwise_api.dependencies import (
    GeocoderDep,
    RepositoryDep,
    TravelDep,
    rate_limited,
    search_limited,
)
from tripwise_api.integrations.geocoding import ATTRIBUTION, GeocodingError
from tripwise_api.routes.common import PLACES_UNAVAILABLE
from tripwise_api.schemas.places import PlaceSearchResponse, TravelRequest, TravelResponse
from tripwise_api.schemas.profile import Language
from tripwise_api.schemas.trip_request import GeoPoint

router = APIRouter(tags=["places"], dependencies=[rate_limited])


@router.get("/places/search", dependencies=[search_limited])
async def search_places(
    user: CurrentUser,
    repository: RepositoryDep,
    geocoder: GeocoderDep,
    q: Annotated[str, Query(min_length=2, max_length=120)],
    lat: Annotated[float | None, Query(ge=-90, le=90)] = None,
    lng: Annotated[float | None, Query(ge=-180, le=180)] = None,
) -> PlaceSearchResponse:
    """Search real places (on submit, never as-you-type, per the geocoders' usage policies).
    With lat/lng, results near that point come first."""
    profile = await repository.get_profile(user.uid)
    language = profile.preferences.language if profile else Language.EN
    near = GeoPoint(lat=lat, lng=lng) if lat is not None and lng is not None else None
    try:
        results = await geocoder.search(q, near, 8, language.value)
    except GeocodingError as error:
        raise PLACES_UNAVAILABLE from error
    return PlaceSearchResponse(results=results, attribution=ATTRIBUTION)


@router.post("/travel")
async def travel_times(body: TravelRequest, user: CurrentUser, travel: TravelDep) -> TravelResponse:
    """Travel time per leg between consecutive points, each labelled with its source."""
    return TravelResponse(legs=await travel.legs(body.points))
