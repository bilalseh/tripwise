"""Helpers shared by the routes: consistent error shapes, trip lookup, metered AI calls."""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import HTTPException, status

from tripwise_api.ai.types import AiUnavailableError
from tripwise_api.auth import AuthenticatedUser
from tripwise_api.config import Settings
from tripwise_api.dependencies import Clock
from tripwise_api.domain.usage import UsageLimitError, next_reset, usage_day
from tripwise_api.integrations.geocoding import GeocodingError
from tripwise_api.repository import Repository
from tripwise_api.schemas.profile import Language, Preferences, Profile, Tier
from tripwise_api.schemas.trip import Trip

AI_UNAVAILABLE = HTTPException(
    status.HTTP_503_SERVICE_UNAVAILABLE,
    detail={
        "code": "ai_unavailable",
        "message": "The AI is busy right now. Please try again soon.",
    },
)
PLACES_UNAVAILABLE = HTTPException(
    status.HTTP_503_SERVICE_UNAVAILABLE,
    detail={"code": "places_unavailable", "message": "Place search is unavailable right now."},
)


def not_found(what: str) -> HTTPException:
    return HTTPException(
        status.HTTP_404_NOT_FOUND, detail={"code": "not_found", "message": f"{what} not found"}
    )


def conflict(code: str, message: str) -> HTTPException:
    return HTTPException(status.HTTP_409_CONFLICT, detail={"code": code, "message": message})


async def require_trip(repository: Repository, uid: str, trip_id: str) -> Trip:
    trip = await repository.get_trip(uid, trip_id)
    if trip is None:
        raise not_found("Trip")
    return trip


async def require_profile(repository: Repository, uid: str) -> Profile:
    profile = await repository.get_profile(uid)
    if profile is None:
        raise not_found("Profile")
    return profile


def tier_of(profile: Profile | None) -> Tier:
    return profile.tier if profile else Tier.FREE


def daily_ai_limit(tier: Tier, settings: Settings) -> int:
    return settings.ai_daily_limit_pro if tier is Tier.PRO else settings.ai_daily_limit_free


@asynccontextmanager
async def metered_ai(
    repository: Repository, user: AuthenticatedUser, clock: Clock, settings: Settings
) -> AsyncIterator[Language]:
    """Count one AI request against the daily limits (429 when reached) and yield the language
    the AI should write in. If the AI (or the geocoder behind it) fails, the request is given
    back and the client gets a 503."""
    now = clock()
    day = usage_day(now)
    profile = await repository.get_profile(user.uid)
    limit = daily_ai_limit(tier_of(profile), settings)
    try:
        await repository.count_ai_request(user.uid, day, limit, settings.ai_daily_limit_global)
    except UsageLimitError as error:
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS,
            detail={
                "code": "ai_limit_reached",
                "scope": error.scope.value,
                "resetsAt": next_reset(now).isoformat(),
            },
        ) from error
    preferences = profile.preferences if profile else Preferences()
    try:
        yield preferences.language
    except AiUnavailableError as error:
        await repository.refund_ai_request(user.uid, day)
        raise AI_UNAVAILABLE from error
    except GeocodingError as error:
        await repository.refund_ai_request(user.uid, day)
        raise PLACES_UNAVAILABLE from error
