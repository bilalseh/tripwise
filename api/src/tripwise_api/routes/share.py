"""Read-only share links. The token is random and unguessable; revoking deletes it, and the
public endpoint returns only the map and the itinerary, never notes, budget or documents."""

import secrets

from fastapi import APIRouter, Response, status

from tripwise_api.auth import CurrentUser
from tripwise_api.dependencies import RepositoryDep, rate_limited
from tripwise_api.routes.common import not_found, require_trip
from tripwise_api.schemas.account import SharedTrip, ShareLink

router = APIRouter(tags=["sharing"])

TOKEN_BYTES = 18  # 144 bits, 24 URL-safe characters


def _link(token: str) -> ShareLink:
    return ShareLink(token=token, path=f"/share/{token}")


@router.post("/trips/{trip_id}/share", dependencies=[rate_limited])
async def create_share(trip_id: str, user: CurrentUser, repository: RepositoryDep) -> ShareLink:
    """Return the trip's share link, creating one if it has none."""
    trip = await require_trip(repository, user.uid, trip_id)
    if trip.share_token:
        return _link(trip.share_token)
    token = secrets.token_urlsafe(TOKEN_BYTES)
    await repository.set_share(user.uid, trip_id, token)
    return _link(token)


@router.delete(
    "/trips/{trip_id}/share", status_code=status.HTTP_204_NO_CONTENT, dependencies=[rate_limited]
)
async def revoke_share(trip_id: str, user: CurrentUser, repository: RepositoryDep) -> Response:
    await require_trip(repository, user.uid, trip_id)
    await repository.set_share(user.uid, trip_id, None)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/shared/{token}")
async def get_shared_trip(token: str, repository: RepositoryDep, response: Response) -> SharedTrip:
    """Public: no sign-in needed. Unknown and revoked tokens look the same (404)."""
    response.headers["Cache-Control"] = "private, max-age=60"
    response.headers["X-Robots-Tag"] = "noindex"
    owner = await repository.resolve_share(token) if 16 <= len(token) <= 64 else None
    trip = await repository.get_trip(*owner) if owner else None
    if trip is None or trip.share_token != token:
        raise not_found("Shared trip")
    days = [
        day.model_copy(
            update={
                "stops": [s.model_copy(update={"note": ""}) for s in day.stops],
                "rain_plan": [s.model_copy(update={"note": ""}) for s in day.rain_plan],
            }
        )
        for day in trip.days
    ]
    request = trip.request
    return SharedTrip(
        title=trip.title,
        destinations=request.destinations,
        start_date=request.start_date,
        travelers=request.travelers,
        currency=request.currency,
        days=days,
    )
