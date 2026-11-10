"""Every AI suggestion must resolve to a real place near the destination, or it is dropped."""

import json
from typing import Any

import pytest

from tests.conftest import LISBON, trip_request
from tests.fakes import ScriptedProvider, counter_ids
from tests.stops import stop
from tripwise_api.ai.client import AiClient
from tripwise_api.ai.types import AiUnavailableError
from tripwise_api.integrations.fake_geocoder import FakeGeocoder
from tripwise_api.planning.ai_models import AiStop
from tripwise_api.planning.generate import plan_days
from tripwise_api.planning.grounding import MAX_KM, find_place
from tripwise_api.schemas.places import PlaceKind, PlaceResult
from tripwise_api.schemas.profile import Language
from tripwise_api.schemas.trip import Day, Place, PlaceSource, Slot, StopCategory
from tripwise_api.schemas.trip_request import GeoPoint, Pace

pytestmark = pytest.mark.anyio


class TableGeocoder:
    """Returns fixed results per query prefix."""

    name = "table"

    def __init__(self, table: dict[str, list[PlaceResult]]) -> None:
        self.table = table
        self.queries: list[str] = []

    async def search(
        self, query: str, near: GeoPoint | None, limit: int, language: str
    ) -> list[PlaceResult]:
        self.queries.append(query)
        return next((v for k, v in self.table.items() if query.startswith(k)), [])


def result(name: str, lat: float, lng: float, kind: PlaceKind = PlaceKind.POI) -> PlaceResult:
    place = Place(
        name=name,
        address=f"{name}, Lisbon",
        location=GeoPoint(lat=lat, lng=lng),
        source=PlaceSource.NOMINATIM,
    )
    return PlaceResult(place=place, kind=kind)


async def test_a_specific_place_near_the_destination_is_accepted() -> None:
    geocoder = TableGeocoder({"Belém Tower": [result("Torre de Belém", 38.6916, -9.2160)]})

    found = await find_place(geocoder, "Belém Tower", "Belém", LISBON, "en")

    assert found is not None
    assert found.place.name == "Torre de Belém"  # the geocoder's name, not the AI's


async def test_city_level_matches_and_far_away_namesakes_are_rejected() -> None:
    far = result("Belém Tower replica", 51.5, -0.12)  # London
    area = result("Lisbon", 38.72, -9.14, PlaceKind.AREA)
    geocoder = TableGeocoder({"Tower": [area, far]})

    assert await find_place(geocoder, "Tower", "", LISBON, "en") is None
    assert MAX_KM < 100


async def test_falls_back_to_the_destination_when_the_area_is_wrong() -> None:
    geocoder = TableGeocoder(
        {"Time Out Market, Lisbon": [result("Time Out Market", 38.7071, -9.1458)]}
    )

    found = await find_place(geocoder, "Time Out Market", "Baixa", LISBON, "en")

    assert found is not None
    assert geocoder.queries == ["Time Out Market, Baixa", "Time Out Market, Lisbon"]


def _ai_day(stops: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "title": "Day",
        "stops": stops,
        "rainPlan": [],
        "stayEstimate": 100,
        "foodEstimate": 40,
        "transportEstimate": 5,
    }


def _ai_stop(name: str, slot: str = "morning", minutes: int = 60) -> dict[str, Any]:
    return {
        "name": name,
        "area": "Lisbon",
        "category": "sight",
        "slot": slot,
        "reason": "Nice.",
        "durationMinutes": minutes,
        "costEstimate": 5,
    }


async def test_generation_drops_unresolved_places_and_reports_them() -> None:
    reply = json.dumps(
        {"days": [_ai_day([_ai_stop("Castle"), _ai_stop("Invented Palace"), _ai_stop("Castle")])]}
    )
    ai = AiClient([ScriptedProvider("gemini", [reply])])

    batch = await plan_days(
        ai, FakeGeocoder(), trip_request(), 0, 1, [], Language.EN, counter_ids("s")
    )

    [day] = batch.days
    assert [s.place.name for s in day.stops] == ["Castle"]  # unresolved and duplicate gone
    assert batch.report.dropped == ["Invented Palace"]
    assert batch.report.provider == "gemini"
    assert batch.report.suggested == 3


async def test_invalid_ai_output_is_repaired_once_then_refused() -> None:
    wrong = json.dumps({"days": [_ai_day([{"name": "Castle"}])]})
    provider = ScriptedProvider("gemini", [wrong, wrong])

    with pytest.raises(AiUnavailableError):
        await plan_days(
            AiClient([provider]),
            FakeGeocoder(),
            trip_request(),
            0,
            1,
            [],
            Language.EN,
            counter_ids(),
        )
    assert "could not be used" in provider.requests[1].prompt


async def test_the_wrong_number_of_days_is_sent_back_for_repair() -> None:
    one = json.dumps({"days": [_ai_day([_ai_stop("A")])]})
    two = json.dumps({"days": [_ai_day([_ai_stop("A")]), _ai_day([_ai_stop("B")])]})
    provider = ScriptedProvider("gemini", [one, two])

    batch = await plan_days(
        AiClient([provider]), FakeGeocoder(), trip_request(), 0, 2, [], Language.EN, counter_ids()
    )

    assert len(batch.days) == 2
    assert "expected exactly 2" in provider.requests[1].prompt


async def test_overloaded_days_are_trimmed_but_must_see_places_stay() -> None:
    names = [f"Sight {i}" for i in range(7)] + ["Jerónimos Monastery"]
    reply = json.dumps({"days": [_ai_day([_ai_stop(n, minutes=120) for n in names])]})
    request = trip_request(
        pace=Pace.RELAXED,
        constraints=trip_request().constraints.model_copy(
            update={"must_see": ["Jerónimos Monastery"]}
        ),
    )

    batch = await plan_days(
        AiClient([ScriptedProvider("g", [reply])]),
        FakeGeocoder(),
        request,
        0,
        1,
        [],
        Language.EN,
        counter_ids(),
    )

    [day] = batch.days
    assert "Jerónimos Monastery" in [s.place.name for s in day.stops]
    assert len(day.stops) <= 4
    assert batch.report.trimmed


async def test_places_already_in_the_trip_are_not_repeated() -> None:
    reply = json.dumps({"days": [_ai_day([_ai_stop("Castle"), _ai_stop("Garden")])]})
    castle = (await FakeGeocoder().search("Castle, Lisbon", LISBON.location, 1, "en"))[0].place
    existing = stop("old", castle.location, name=castle.name)
    existing = existing.model_copy(update={"place": castle})
    batch = await plan_days(
        AiClient([ScriptedProvider("g", [reply])]),
        FakeGeocoder(),
        trip_request(),
        1,
        1,
        [Day(destination_index=0, stops=[existing])],
        Language.EN,
        counter_ids(),
    )

    assert [s.place.name for s in batch.days[0].stops] == ["Garden"]


async def test_locked_stops_survive_regeneration_on_their_day() -> None:
    reply = json.dumps({"days": [_ai_day([_ai_stop("Garden", slot="afternoon")])]})
    pinned = stop("keep-me", GeoPoint(lat=38.70, lng=-9.20), Slot.MORNING, locked=True)

    batch = await plan_days(
        AiClient([ScriptedProvider("g", [reply])]),
        FakeGeocoder(),
        trip_request(),
        0,
        1,
        [],
        Language.EN,
        counter_ids(),
        locked=[[pinned]],
    )

    assert next(s.id for s in batch.days[0].stops) == "keep-me"
    assert batch.days[0].stops[0].category is StopCategory.SIGHT


def test_ai_stops_carry_no_coordinates_or_addresses() -> None:
    fields = set(AiStop.model_fields)
    assert not fields & {"lat", "lng", "location", "address", "opening_hours", "price"}


def test_providers_get_a_self_contained_schema() -> None:
    from tripwise_api.planning.ai_models import AiItinerary
    from tripwise_api.schemas.json_schema import provider_schema

    schema = json.dumps(provider_schema(AiItinerary))

    assert "$ref" not in schema
    assert '"durationMinutes"' in schema
    assert '"lat"' not in schema
