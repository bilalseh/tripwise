"""Daily weather from Open-Meteo (free, no key): a forecast when the trip is within the
16-day window, otherwise the same dates last year as a hint of typical weather."""

import logging
from collections.abc import Sequence
from datetime import date, timedelta
from typing import Any, Protocol

import httpx

from tripwise_api.integrations.cache import Cache, cache_key
from tripwise_api.integrations.geocoding import USER_AGENT
from tripwise_api.schemas.essentials import WeatherDay, WeatherKind
from tripwise_api.schemas.trip_request import GeoPoint

logger = logging.getLogger(__name__)
FORECAST_DAYS = 16
DAILY = "temperature_2m_max,temperature_2m_min,weather_code"


class WeatherError(Exception):
    pass


class WeatherSource(Protocol):
    async def daily(
        self, kind: WeatherKind, where: GeoPoint, start: date, end: date
    ) -> list[WeatherDay]: ...


def weather_kind(today: date, start: date | None, end: date | None) -> WeatherKind:
    if start is None or end is None:
        return WeatherKind.UNAVAILABLE
    if end < today:
        return WeatherKind.TYPICAL
    return (
        WeatherKind.FORECAST
        if start <= today + timedelta(days=FORECAST_DAYS - 1)
        else WeatherKind.TYPICAL
    )


def last_year(day: date) -> date:
    try:
        return day.replace(year=day.year - 1)
    except ValueError:  # 29 February
        return day.replace(year=day.year - 1, day=28)


def _values(daily: dict[str, Any], key: str, count: int) -> Sequence[Any]:
    values = daily.get(key)
    return values if isinstance(values, list) else [None] * count


class OpenMeteo:
    FORECAST = "https://api.open-meteo.com/v1/forecast"
    ARCHIVE = "https://archive-api.open-meteo.com/v1/archive"

    def __init__(self, http: httpx.AsyncClient, cache: Cache) -> None:
        self._http = http
        self._cache = cache

    async def daily(
        self, kind: WeatherKind, where: GeoPoint, start: date, end: date
    ) -> list[WeatherDay]:
        forecast = kind is WeatherKind.FORECAST
        query_start, query_end = (start, end) if forecast else (last_year(start), last_year(end))
        rain = "precipitation_probability_max" if forecast else "precipitation_sum"
        params: dict[str, str | float] = {
            "latitude": round(where.lat, 3),
            "longitude": round(where.lng, 3),
            "daily": f"{DAILY},{rain}",
            "timezone": "auto",
            "start_date": query_start.isoformat(),
            "end_date": query_end.isoformat(),
        }
        key = cache_key(kind.value, params)
        data = await self._cache.get("weather", key)
        if data is None:
            try:
                response = await self._http.get(
                    self.FORECAST if forecast else self.ARCHIVE,
                    params=params,
                    headers={"User-Agent": USER_AGENT},
                )
                response.raise_for_status()
                data = response.json()
            except (httpx.HTTPError, ValueError) as error:
                raise WeatherError(type(error).__name__) from error
            await self._cache.set("weather", key, data, timedelta(hours=3 if forecast else 24 * 30))
        daily = data.get("daily") or {}
        times = daily.get("time") or []
        highs, lows = (
            _values(daily, "temperature_2m_max", len(times)),
            _values(daily, "temperature_2m_min", len(times)),
        )
        codes, wet = _values(daily, "weather_code", len(times)), _values(daily, rain, len(times))
        offset = start - query_start
        return [
            WeatherDay(
                date=date.fromisoformat(day) + offset,
                temp_max=highs[i],
                temp_min=lows[i],
                precipitation=wet[i],
                code=codes[i],
            )
            for i, day in enumerate(times)
        ]


class FakeWeather:
    async def daily(
        self, kind: WeatherKind, where: GeoPoint, start: date, end: date
    ) -> list[WeatherDay]:
        days = (end - start).days + 1
        return [
            WeatherDay(
                date=start + timedelta(days=i),
                temp_max=24 - i % 3,
                temp_min=15 - i % 2,
                precipitation=10.0 * (i % 4),
                code=(0, 2, 3, 61)[i % 4],
            )
            for i in range(days)
        ]
