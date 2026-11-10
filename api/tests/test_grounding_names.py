"""Name matching, search radius, lookup fallbacks and the replacement round."""

import json
from typing import Any

import pytest

from tests.conftest import LISBON, trip_request
from tests.fakes import ScriptedProvider, counter_ids
from tripwise_api.ai.client import AiClient
from tripwise_api.integrations.fake_geocoder import FakeGeocoder
from tripwise_api.planning.generate import plan_days
from tripwise_api.planning.grounding import CITY_KM, COUNTRY_KM, find_place, search_radius_km
from tripwise_api.planning.names import name_variants, names_match
from tripwise_api.schemas.places import PlaceKind, PlaceResult
from tripwise_api.schemas.profile import Language
from tripwise_api.schemas.trip import Place, PlaceSource
from tripwise_api.schemas.trip_request import Destination, GeoPoint, Pace

pytestmark = pytest.mark.anyio


def test_long_official_names_get_simpler_variants() -> None:
    assert name_variants("MAAT \u2013 Museum of Art, Architecture and Technology") == [
        "MAAT \u2013 Museum of Art, Architecture and Technology",
        "MAAT",
        "Museum of Art, Architecture and Technology",
    ]
    assert name_variants("Sidon Sea Castle (Qal'at al-Bahr)") == [
        "Sidon Sea Castle (Qal'at al-Bahr)",
        "Sidon Sea Castle",
    ]
    assert name_variants("Belém Tower") == ["Belém Tower"]


@pytest.mark.parametrize(
    ("wanted", "found", "expected"),
    [
        ("City History Museum 1", "Saida History Museum", False),  # generic words only
        ("Old Town Walking Route", "Old Town Walking Route", True),  # generic but exact
        ("Tower of Belém", "Torre de Belém", True),  # shares "belem", accents ignored
        ("Jeronimos Monastery", "Mosteiro dos Jerónimos", True),
        ("MAAT", "MAAT - Museum of Art, Architecture and Technology", True),
        ("Sidon Sea Castle", "قلعة صيدا البحرية", True),  # other script: not comparable
        ("Soap Museum", "National Museum of Beirut", False),
    ],
)
def test_names_must_resemble_each_other(wanted: str, found: str, expected: bool) -> None:
    assert names_match(wanted, found) is expected


def destination(**changes: Any) -> Destination:
    return LISBON.model_copy(update=changes)


def test_search_radius_follows_the_destination_size() -> None:
    assert search_radius_km(destination()) == CITY_KM
    assert search_radius_km(destination(radius_km=120)) == pytest.approx(138)
    assert search_radius_km(destination(radius_km=5)) == CITY_KM
    lebanon = destination(name="Lebanon", country="Lebanon", country_code="lb")
    assert search_radius_km(lebanon) == COUNTRY_KM


class TableGeocoder:
    def __init__(self, name: str, table: dict[str, list[PlaceResult]]) -> None:
        self.name = name
        self.table = table
        self.queries: list[str] = []

    async def search(
        self, query: str, near: GeoPoint | None, limit: int, language: str
    ) -> list[PlaceResult]:
        self.queries.append(query)
        return self.table.get(query, [])


def poi(name: str, lat: float, lng: float, also: str | None = None) -> PlaceResult:
    place = Place(
        name=name,
        address=f"{name}, Lisbon",
        location=GeoPoint(lat=lat, lng=lng),
        source=PlaceSource.PHOTON,
    )
    return PlaceResult(place=place, kind=PlaceKind.POI, also_known_as=also)


async def test_a_simpler_name_is_tried_before_giving_up() -> None:
    osm = TableGeocoder("osm", {"MAAT, Lisbon": [poi("MAAT", 38.6957, -9.1949)]})

    found = await find_place(
        osm, "MAAT \u2013 Museum of Art, Architecture and Technology", "", LISBON, "en"
    )

    assert found is not None
    assert found.place.name == "MAAT"
    assert osm.queries[0].startswith("MAAT \u2013 Museum")


async def test_a_lookalike_answer_to_a_generic_name_is_refused() -> None:
    osm = TableGeocoder(
        "osm", {"City History Museum, Lisbon": [poi("Saida History Museum", 38.72, -9.14)]}
    )

    assert await find_place(osm, "City History Museum", "", LISBON, "en") is None


async def test_landmarks_are_the_fallback_and_aliases_count() -> None:
    osm = TableGeocoder("osm", {})
    wikidata = TableGeocoder(
        "wikidata",
        {
            "Monument to the Discoveries, Lisbon": [
                poi(
                    "Padrão dos Descobrimentos",
                    38.6936,
                    -9.2057,
                    also="Monument to the Discoveries",
                )
            ]
        },
    )

    found = await find_place([osm, wikidata], "Monument to the Discoveries", "", LISBON, "en")

    assert found is not None
    assert found.place.name == "Padrão dos Descobrimentos"
    assert osm.queries
    assert wikidata.queries


async def test_a_country_destination_accepts_places_across_it() -> None:
    lebanon = Destination(
        name="Lebanon",
        display_name="Lebanon",
        country="Lebanon",
        country_code="lb",
        location=GeoPoint(lat=33.87, lng=35.86),
        days=3,
    )
    osm = TableGeocoder(
        "osm",
        {
            "Tripoli Citadel, Lebanon": [
                poi("Citadel of Raymond de Saint-Gilles", 34.43, 35.84, also="Tripoli Citadel")
            ]
        },
    )

    found = await find_place(osm, "Tripoli Citadel", "", lebanon, "en")

    assert found is not None  # about 62 km from the centre: outside a city radius, inside Lebanon


def _day(names: list[str]) -> dict[str, Any]:
    stops = [
        {
            "name": n,
            "area": "Lisbon",
            "category": "sight",
            "slot": "morning",
            "reason": "",
            "durationMinutes": 60,
            "costEstimate": 0,
        }
        for n in names
    ]
    return {
        "title": "Day",
        "stops": stops,
        "rainPlan": [],
        "stayEstimate": 0,
        "foodEstimate": 0,
        "transportEstimate": 0,
    }


async def test_short_days_get_one_round_of_grounded_replacements() -> None:
    first = json.dumps(
        {"days": [_day(["Castle", "Invented A", "Invented B", "Invented C", "Invented D"])]}
    )
    refill = json.dumps(
        {
            "days": [
                {"day": 1, "stops": _day(["Garden", "Invented E", "Market", "Gallery"])["stops"]}
            ]
        }
    )
    provider = ScriptedProvider("gemini", [first, refill])

    batch = await plan_days(
        AiClient([provider]),
        FakeGeocoder(),
        trip_request(pace=Pace.BALANCED),
        0,
        1,
        [],
        Language.EN,
        counter_ids(),
    )

    names = [s.place.name for s in batch.days[0].stops]
    assert names.count("Castle") == 1
    assert {"Garden", "Market", "Gallery"} <= set(names)
    assert "Invented E" in batch.report.dropped
    assert "Invented A" in provider.requests[1].prompt  # told what was not found


async def test_no_replacement_round_when_time_is_short() -> None:
    first = json.dumps({"days": [_day(["Castle", "Invented A", "Invented B", "Invented C"])]})
    provider = ScriptedProvider("gemini", [first])
    ticks = iter([0.0, 100.0])

    batch = await plan_days(
        AiClient([provider]),
        FakeGeocoder(),
        trip_request(),
        0,
        1,
        [],
        Language.EN,
        counter_ids(),
        clock=lambda: next(ticks),
    )

    assert len(provider.requests) == 1
    assert [s.place.name for s in batch.days[0].stops] == ["Castle"]


async def test_the_closest_name_wins_over_a_bus_stop_that_mentions_it() -> None:
    stop_sign = poi("Bus (nr10) to Martyrs Square (1$)", 33.85, 35.52)
    square = poi("Martyrs' Square", 33.8958, 35.5070)
    osm = TableGeocoder("osm", {"Martyrs' Square, Lisbon": [stop_sign, square]})

    found = await find_place(
        osm,
        "Martyrs' Square",
        "",
        LISBON.model_copy(update={"location": GeoPoint(lat=33.89, lng=35.50)}),
        "en",
    )

    assert found is not None
    assert found.place.name == "Martyrs' Square"


def test_hyphen_look_alikes_are_normalised() -> None:
    assert name_variants("Souk al\u2011Tawileh") == ["Souk al-Tawileh"]
