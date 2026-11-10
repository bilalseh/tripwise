"""Wrappers around geocoders: a 30-day cache, and a fallback chain that rests a failing
geocoder for a while so an outage does not slow every search."""

import logging
import time
from collections.abc import Callable, Sequence
from datetime import timedelta

from tripwise_api.integrations.cache import Cache, cache_key
from tripwise_api.integrations.geocoding import Geocoder, GeocodingError
from tripwise_api.schemas.places import PlaceResult
from tripwise_api.schemas.trip_request import GeoPoint

logger = logging.getLogger(__name__)

CACHE_TTL = timedelta(days=30)


class CachedGeocoder:
    def __init__(self, inner: Geocoder, cache: Cache) -> None:
        self._inner = inner
        self._cache = cache
        self.name = inner.name

    async def search(
        self, query: str, near: GeoPoint | None, limit: int, language: str
    ) -> list[PlaceResult]:
        bias = (round(near.lat, 2), round(near.lng, 2)) if near else None
        key = cache_key(self.name, query.strip().lower(), bias, limit, language)
        cached = await self._cache.get("geocode", key)
        if isinstance(cached, list):
            return [PlaceResult.model_validate(item) for item in cached]
        results = await self._inner.search(query, near, limit, language)
        await self._cache.set(
            "geocode", key, [r.model_dump(mode="json") for r in results], CACHE_TTL
        )
        return results


class FallbackGeocoder:
    """Tries each geocoder in turn until one answers (an empty answer counts as an answer)."""

    def __init__(
        self,
        geocoders: Sequence[Geocoder],
        rest_seconds: float = 30.0,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self._geocoders = list(geocoders)
        self.name = "+".join(g.name for g in self._geocoders)
        self._rest = rest_seconds
        self._clock = clock
        self._resting_until: dict[str, float] = {}

    async def search(
        self, query: str, near: GeoPoint | None, limit: int, language: str
    ) -> list[PlaceResult]:
        """A geocoder that fails rests for a while, so an outage does not slow every search."""
        now = self._clock()
        awake = [g for g in self._geocoders if self._resting_until.get(g.name, 0) <= now]
        for geocoder in awake or self._geocoders:
            try:
                return await geocoder.search(query, near, limit, language)
            except GeocodingError as error:
                logger.warning("geocoder %s failed: %s", geocoder.name, error)
                self._resting_until[geocoder.name] = self._clock() + self._rest
        raise GeocodingError("every geocoder failed")
