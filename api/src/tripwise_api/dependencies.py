"""Shared FastAPI dependencies. Everything is read from app.state, so tests swap in fakes."""

from collections.abc import Callable
from datetime import UTC, datetime
from typing import Annotated

from fastapi import Depends, HTTPException, Request, status

from tripwise_api.ai.client import AiClient
from tripwise_api.auth import CurrentUser
from tripwise_api.billing.stripe import Billing
from tripwise_api.config import Settings
from tripwise_api.integrations.geocoding import Geocoder
from tripwise_api.integrations.routing import TravelService
from tripwise_api.integrations.weather import WeatherSource
from tripwise_api.rate_limit import RateLimiter
from tripwise_api.repository import Repository

Clock = Callable[[], datetime]
NewId = Callable[[], str]


def utc_now() -> datetime:
    return datetime.now(UTC)


def _state[T](name: str, kind: type[T]) -> Callable[[Request], T]:
    def get(request: Request) -> T:
        value: T = getattr(request.app.state, name)
        return value

    get.__name__ = f"get_{name}"
    return get


get_settings = _state("settings", Settings)
get_repository = _state("repository", object)
get_ai = _state("ai", AiClient)

RepositoryDep = Annotated[Repository, Depends(get_repository)]
ClockDep = Annotated[Clock, Depends(_state("clock", object))]
NewIdDep = Annotated[NewId, Depends(_state("new_id", object))]
AiDep = Annotated[AiClient, Depends(get_ai)]
SettingsDep = Annotated[Settings, Depends(get_settings)]
GeocoderDep = Annotated[Geocoder, Depends(_state("geocoder", object))]
# Grounding lookups in order: map search, then the landmark lookup when configured.
LookupsDep = Annotated[list[Geocoder], Depends(_state("lookups", list))]
TravelDep = Annotated[TravelService, Depends(_state("travel", TravelService))]
WeatherDep = Annotated[WeatherSource, Depends(_state("weather", object))]
BillingDep = Annotated[Billing | None, Depends(_state("billing", object))]
LimiterDep = Annotated[RateLimiter, Depends(_state("limiter", RateLimiter))]


def _limited(bucket: str, limit: Callable[[Settings], int]) -> Callable[..., None]:
    def check(user: CurrentUser, limiter: LimiterDep, settings: SettingsDep) -> None:
        if not limiter.allow(bucket, user.uid, limit(settings)):
            raise HTTPException(
                status.HTTP_429_TOO_MANY_REQUESTS,
                detail={
                    "code": "rate_limited",
                    "message": "Too many requests, slow down a little.",
                },
                headers={"Retry-After": str(limiter.retry_after(bucket, user.uid))},
            )

    return check


rate_limited = Depends(_limited("api", lambda s: s.rate_limit_per_minute))
search_limited = Depends(_limited("search", lambda s: s.search_limit_per_minute))
