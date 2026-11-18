"""The local places index: search, coverage, strict matching and its place in the lookup order."""

from collections.abc import Iterator
from pathlib import Path

import pytest

from tripwise_api.integrations.geocoder_wrappers import LocalFirstGeocoder
from tripwise_api.integrations.geocoding import GeocodingError
from tripwise_api.integrations.local_places import IndexedPlace, LocalPlaces, write_index
from tripwise_api.planning.grounding import find_place
from tripwise_api.planning.names import closely_matches
from tripwise_api.schemas.places import PlaceKind, PlaceResult
from tripwise_api.schemas.trip import Place, PlaceSource
from tripwise_api.schemas.trip_request import Destination, GeoPoint

pytestmark = pytest.mark.anyio

BEIRUT = GeoPoint(lat=33.89, lng=35.50)
DAMASCUS = GeoPoint(lat=33.51, lng=36.29)


def poi(name: str, lat: float, lng: float, arabic: str | None = None) -> IndexedPlace:
    return IndexedPlace(
        kind=PlaceKind.POI,
        name=name,
        name_en=name,
        name_ar=arabic,
        address=f"{name}, Lebanon",
        lat=lat,
        lng=lng,
    )


def town(name: str, lat: float, lng: float) -> IndexedPlace:
    return IndexedPlace(
        kind=PlaceKind.AREA, name=name, name_en=name, address="Lebanon", lat=lat, lng=lng
    )


@pytest.fixture
def index(tmp_path: Path) -> Iterator[LocalPlaces]:
    path = tmp_path / "places.sqlite"
    write_index(
        path,
        [
            poi("Deek Duke", 33.896, 35.479, "ديك ديوك"),
            poi("Deek Duke", 34.105, 35.654),
            poi("Byblos Bakery", 34.121, 35.648),
            poi("Beiteddine Palace", 33.696, 35.580),
            town("Byblos", 34.124, 35.649),
            town("Beirut", 33.896, 35.478),
        ],
    )
    places = LocalPlaces(path)
    yield places
    places.close()


class OnlineGeocoder:
    name = "online"

    def __init__(self, results: list[PlaceResult] | None = None, fails: bool = False) -> None:
        self.results = results or []
        self.fails = fails
        self.queries: list[str] = []

    async def search(
        self, query: str, near: GeoPoint | None, limit: int, language: str
    ) -> list[PlaceResult]:
        self.queries.append(query)
        if self.fails:
            raise GeocodingError("down")
        return self.results


def online_place(name: str, lat: float, lng: float) -> PlaceResult:
    place = Place(
        name=name,
        address=f"{name}, online",
        location=GeoPoint(lat=lat, lng=lng),
        source=PlaceSource.PHOTON,
    )
    return PlaceResult(place=place, kind=PlaceKind.POI)


def lebanon() -> Destination:
    return Destination(
        name="Lebanon",
        display_name="Lebanon",
        country="Lebanon",
        country_code="lb",
        location=BEIRUT,
        days=2,
    )


async def test_finds_a_place_and_puts_the_nearest_branch_first(index: LocalPlaces) -> None:
    results = await index.search("deek duke restaurant", BEIRUT, 5, "en")

    assert [r.place.name for r in results[:2]] == ["Deek Duke", "Deek Duke"]
    assert results[0].place.location.lat == 33.896
    assert results[0].place.source is PlaceSource.OVERTURE


async def test_shows_the_arabic_name_to_arabic_users(index: LocalPlaces) -> None:
    results = await index.search("Deek Duke", BEIRUT, 1, "ar")

    assert results[0].place.name == "ديك ديوك"


def test_knows_where_it_has_data(index: LocalPlaces) -> None:
    assert index.covers(BEIRUT)
    assert not index.covers(DAMASCUS)


@pytest.mark.parametrize(
    ("wanted", "found", "expected"),
    [
        ("Deek Duke Restaurant", "Deek Duke", True),
        ("Marie Baz Wax Museum", "Marie Baz Museum", True),
        ("Al Midan Restaurant", "Al Midane Cafe Restaurant", True),
        ("Byblos Castle", "Byblos Bakery", False),
        ("Byblos Castle", "Monoberge Hotel Byblos", False),
        ("Saint George Cathedral", "Saint George Bakery", False),
        ("Saint Paul Basilica", "Saint Paul Convent", False),
        ("Deir el Qamar", "Suiteness Deir El Qamar", False),
        ("Our Lady of Lebanon", "Souvenirs of Our Lady of Lebanon", False),
        ("Sursock Museum", "Sursock Museum Store", False),
    ],
)
def test_the_index_needs_a_close_name(wanted: str, found: str, expected: bool) -> None:
    assert closely_matches(wanted, found) is expected


async def test_grounding_uses_the_index_without_going_online(index: LocalPlaces) -> None:
    online = OnlineGeocoder()

    found = await find_place([index, online], "Beiteddine Palace", "", lebanon(), "en")

    assert found is not None
    assert found.place.source is PlaceSource.OVERTURE
    assert online.queries == []


async def test_grounding_goes_online_when_the_index_has_no_close_match(
    index: LocalPlaces,
) -> None:
    castle = online_place("Byblos Castle", 34.120, 35.646)
    online = OnlineGeocoder([castle])

    found = await find_place([index, online], "Byblos Castle", "Byblos", lebanon(), "en")

    assert found is not None
    assert found.place.source is PlaceSource.PHOTON


async def test_grounding_skips_the_index_outside_its_area(index: LocalPlaces) -> None:
    syria = lebanon().model_copy(update={"name": "Damascus", "location": DAMASCUS})
    online = OnlineGeocoder([online_place("Deek Duke", 33.51, 36.29)])

    found = await find_place([index, online], "Deek Duke", "", syria, "en")

    assert found is not None
    assert found.place.source is PlaceSource.PHOTON


async def test_people_see_local_matches_first_without_far_away_namesakes(
    index: LocalPlaces,
) -> None:
    jordan = online_place("Deek Duke Chicken", 30.32, 35.48)
    nearby = online_place("Deek Duke Express", 33.90, 35.51)
    search = LocalFirstGeocoder(index, OnlineGeocoder([jordan, nearby]))

    results = await search.search("deek duke", BEIRUT, 8, "en")

    assert [r.place.name for r in results] == ["Deek Duke", "Deek Duke", "Deek Duke Express"]


async def test_local_matches_survive_an_online_outage(index: LocalPlaces) -> None:
    search = LocalFirstGeocoder(index, OnlineGeocoder(fails=True))

    results = await search.search("deek duke", BEIRUT, 8, "en")

    assert len(results) == 2


async def test_searches_elsewhere_stay_online(index: LocalPlaces) -> None:
    online = OnlineGeocoder([online_place("Umayyad Mosque", 33.51, 36.31)])
    search = LocalFirstGeocoder(index, online)

    results = await search.search("Umayyad Mosque", DAMASCUS, 8, "en")

    assert [r.place.name for r in results] == ["Umayyad Mosque"]
