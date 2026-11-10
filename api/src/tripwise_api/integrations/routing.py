"""Travel times between stops.

Short legs are walked: a straight-line estimate is honest enough and costs nothing. Longer
legs ask the OSRM demo server for a driving time (one request per day's route, cached), and
fall back to an estimate when it is busy. Every leg says where its number came from.
"""

import itertools
import logging
from collections.abc import Sequence
from datetime import timedelta
from typing import Any, Protocol

import httpx

from tripwise_api.domain.geo import estimate_leg
from tripwise_api.integrations.cache import Cache, cache_key
from tripwise_api.integrations.geocoding import USER_AGENT
from tripwise_api.integrations.throttle import Throttle
from tripwise_api.schemas.places import TravelLeg, TravelMode, TravelSource
from tripwise_api.schemas.trip_request import GeoPoint

logger = logging.getLogger(__name__)
CACHE_TTL = timedelta(days=14)


class Router(Protocol):
    async def driving_legs(self, points: Sequence[GeoPoint]) -> list[tuple[float, float]] | None:
        """(minutes, km) per leg, or None when routing is unavailable."""
        ...


class OsrmRouter:
    URL = "https://router.project-osrm.org/route/v1/driving/"

    def __init__(self, http: httpx.AsyncClient, throttle: Throttle) -> None:
        self._http = http
        self._throttle = throttle

    async def driving_legs(self, points: Sequence[GeoPoint]) -> list[tuple[float, float]] | None:
        path = ";".join(f"{p.lng:.5f},{p.lat:.5f}" for p in points)
        try:
            async with self._throttle.slot():
                response = await self._http.get(
                    self.URL + path,
                    params={"overview": "false"},
                    headers={"User-Agent": USER_AGENT},
                )
            response.raise_for_status()
            data: Any = response.json()
            legs = data["routes"][0]["legs"]
            return [(float(leg["duration"]) / 60, float(leg["distance"]) / 1000) for leg in legs]
        except (httpx.HTTPError, KeyError, IndexError, TypeError, ValueError) as error:
            logger.info("OSRM unavailable, using estimates: %s", type(error).__name__)
            return None


class NoRouter:
    """Estimates only; used in tests and when external calls are switched off."""

    async def driving_legs(self, points: Sequence[GeoPoint]) -> list[tuple[float, float]] | None:
        return None


class TravelService:
    def __init__(self, router: Router, cache: Cache) -> None:
        self._router = router
        self._cache = cache

    async def legs(self, points: Sequence[GeoPoint]) -> list[TravelLeg]:
        estimates = [estimate_leg(a, b) for a, b in itertools.pairwise(points)]
        if all(leg.mode is TravelMode.WALK for leg in estimates):
            return estimates
        key = cache_key([(round(p.lat, 5), round(p.lng, 5)) for p in points])
        routed = await self._cache.get("route", key)
        if routed is None:
            routed = await self._router.driving_legs(points)
            if routed is not None:
                await self._cache.set("route", key, routed, CACHE_TTL)
        if not isinstance(routed, list) or len(routed) != len(estimates):
            return estimates
        return [
            TravelLeg(
                minutes=max(1, round(minutes)),
                km=round(km, 2),
                mode=TravelMode.DRIVE,
                source=TravelSource.OSRM,
            )
            if estimate.mode is TravelMode.DRIVE
            else estimate
            for estimate, (minutes, km) in zip(estimates, routed, strict=True)
        ]
