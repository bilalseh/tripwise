"""Geocoder parsing and caching, throttling, routing fallbacks and weather windows."""

from datetime import date, timedelta
from typing import Any

import httpx
import pytest

from tests.fakes import MemoryOnlyCache
from tripwise_api.integrations.cache import MemoryCache
from tripwise_api.integrations.geocoding import (
    USER_AGENT,
    CachedGeocoder,
    FallbackGeocoder,
    GeocodingError,
    NominatimGeocoder,
    PhotonGeocoder,
)
from tripwise_api.integrations.routing import OsrmRouter, TravelService
from tripwise_api.integrations.throttle import Throttle
from tripwise_api.integrations.weather import OpenMeteo, last_year, weather_kind
from tripwise_api.schemas.essentials import WeatherKind
from tripwise_api.schemas.places import PlaceKind, PlaceResult, TravelSource
from tripwise_api.schemas.trip import PlaceSource
from tripwise_api.schemas.trip_request import GeoPoint

pytestmark = pytest.mark.anyio
LISBON = GeoPoint(lat=38.72, lng=-9.14)


def http_with(handler: Any) -> httpx.AsyncClient:
    return httpx.AsyncClient(transport=httpx.MockTransport(handler))


def free_throttle() -> Throttle:
    return Throttle(0)


PHOTON = {
    "features": [
        {
            "geometry": {"coordinates": [-9.2160, 38.6916]},
            "properties": {
                "name": "Torre de Belém",
                "street": "Avenida Brasília",
                "city": "Lisbon",
                "country": "Portugal",
                "countrycode": "PT",
                "osm_type": "W",
                "osm_id": 7,
                "type": "house",
                "osm_value": "attraction",
            },
        },
        {
            "geometry": {"coordinates": [-9.14, 38.72]},
            "properties": {"name": "Lisbon", "type": "city", "osm_value": "city"},
        },
    ]
}


async def test_photon_results_become_real_places_with_kinds() -> None:
    seen: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return httpx.Response(200, json=PHOTON)

    async with http_with(handler) as http:
        results = await PhotonGeocoder(http, free_throttle()).search("Belém", LISBON, 5, "en")

    tower, city = results
    assert tower.place.name == "Torre de Belém"
    assert tower.kind is PlaceKind.POI
    assert tower.place.address == "Avenida Brasília, Lisbon, Portugal"
    assert tower.place.source is PlaceSource.PHOTON
    assert tower.country_code == "pt"
    assert city.kind is PlaceKind.AREA
    assert seen[0].headers["User-Agent"] == USER_AGENT
    assert seen[0].url.params["lat"] == "38.72"


async def test_nominatim_parses_and_sends_a_viewbox() -> None:
    body = [
        {
            "lat": "38.6979",
            "lon": "-9.2068",
            "name": "Mosteiro dos Jerónimos",
            "display_name": "Mosteiro dos Jerónimos, Belém, Lisboa, Portugal",
            "osm_type": "way",
            "osm_id": 1,
            "addresstype": "tourism",
            "address": {"country": "Portugal", "country_code": "pt"},
        }
    ]

    def handler(request: httpx.Request) -> httpx.Response:
        assert "viewbox" in request.url.params
        return httpx.Response(200, json=body)

    async with http_with(handler) as http:
        [found] = await NominatimGeocoder(http, free_throttle()).search(
            "Jerónimos", LISBON, 5, "pt"
        )

    assert found.place.osm_id == "W1"
    assert found.kind is PlaceKind.POI
    assert found.place.address.startswith("Mosteiro dos Jerónimos, Belém")


async def test_geocoder_errors_fall_through_to_the_next_one() -> None:
    def down(request: httpx.Request) -> httpx.Response:
        return httpx.Response(503)

    def up(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=PHOTON)

    async with http_with(down) as bad, http_with(up) as good:
        chain = FallbackGeocoder(
            [NominatimGeocoder(bad, free_throttle()), PhotonGeocoder(good, free_throttle())]
        )
        assert len(await chain.search("x", None, 5, "en")) == 2
        with pytest.raises(GeocodingError):
            await FallbackGeocoder([NominatimGeocoder(bad, free_throttle())]).search(
                "x", None, 5, "en"
            )


async def test_geocoding_results_are_cached() -> None:
    calls = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        return httpx.Response(200, json=PHOTON)

    async with http_with(handler) as http:
        cached = CachedGeocoder(PhotonGeocoder(http, free_throttle()), MemoryOnlyCache())
        first = await cached.search("Belém ", LISBON, 5, "en")
        second = await cached.search("belém", LISBON, 5, "en")

    assert calls == 1
    assert [PlaceResult.model_validate(r.model_dump()) for r in first] == second


async def test_throttle_spaces_calls() -> None:
    now = [100.0]
    slept: list[float] = []

    async def sleep(seconds: float) -> None:
        slept.append(seconds)
        now[0] += seconds

    throttle = Throttle(2.0, clock=lambda: now[0], sleep=sleep)
    for _ in range(3):
        async with throttle.slot():
            pass

    assert slept == [2.0, 2.0]


async def test_memory_cache_expires_and_evicts() -> None:
    now = [0.0]
    cache = MemoryCache(max_entries=2, clock=lambda: now[0])
    await cache.set("n", "a", 1, timedelta(seconds=10))
    await cache.set("n", "b", 2, timedelta(seconds=10))
    await cache.set("n", "c", 3, timedelta(seconds=10))

    assert await cache.get("n", "a") is None
    now[0] = 11
    assert await cache.get("n", "c") is None


async def test_travel_uses_osrm_for_long_legs_and_estimates_for_walks() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={
                "routes": [
                    {
                        "legs": [
                            {"duration": 300, "distance": 500},
                            {"duration": 900, "distance": 7000},
                        ]
                    }
                ]
            },
        )

    points = [
        GeoPoint(lat=38.6979, lng=-9.2068),
        GeoPoint(lat=38.6975, lng=-9.2032),
        GeoPoint(lat=38.7139, lng=-9.1335),
    ]
    async with http_with(handler) as http:
        legs = await TravelService(OsrmRouter(http, free_throttle()), MemoryOnlyCache()).legs(
            points
        )

    assert [leg.source for leg in legs] == [TravelSource.ESTIMATE, TravelSource.OSRM]
    assert legs[1].minutes == 15
    assert legs[1].km == 7.0


async def test_travel_falls_back_to_estimates_when_osrm_is_down() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(429)

    points = [GeoPoint(lat=38.69, lng=-9.20), GeoPoint(lat=38.75, lng=-9.10)]
    async with http_with(handler) as http:
        legs = await TravelService(OsrmRouter(http, free_throttle()), MemoryOnlyCache()).legs(
            points
        )

    assert [leg.source for leg in legs] == [TravelSource.ESTIMATE]


def test_weather_window() -> None:
    today = date(2026, 11, 10)
    assert (
        weather_kind(today, today + timedelta(days=15), today + timedelta(days=17))
        is WeatherKind.FORECAST
    )
    assert (
        weather_kind(today, today + timedelta(days=16), today + timedelta(days=18))
        is WeatherKind.TYPICAL
    )
    assert weather_kind(today, None, None) is WeatherKind.UNAVAILABLE
    assert last_year(date(2028, 2, 29)) == date(2027, 2, 28)


async def test_typical_weather_reads_last_year_and_maps_dates_forward() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.host == "archive-api.open-meteo.com"
        assert request.url.params["start_date"] == "2026-03-01"
        daily = {
            "time": ["2026-03-01", "2026-03-02"],
            "temperature_2m_max": [17, 18],
            "temperature_2m_min": [9, 10],
            "weather_code": [3, 61],
            "precipitation_sum": [0, 4.2],
        }
        return httpx.Response(200, json={"daily": daily})

    async with http_with(handler) as http:
        days = await OpenMeteo(http, MemoryOnlyCache()).daily(
            WeatherKind.TYPICAL, LISBON, date(2027, 3, 1), date(2027, 3, 2)
        )

    assert [d.date for d in days] == [date(2027, 3, 1), date(2027, 3, 2)]
    assert days[1].precipitation == 4.2
    assert days[1].code == 61
