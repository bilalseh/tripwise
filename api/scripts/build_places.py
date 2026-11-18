"""Build the local places index for Lebanon from the latest Overture Maps release.

Run from `api/`: uv run --with duckdb==2.0.0 python scripts/build_places.py [output file]

The index is generated at deploy time and is not committed. It keeps travel-related places only,
without contact details. Records from Foursquare are left out, so all the data is under the
CDLA Permissive 2.0 licence (or CC0).
"""

# ruff: noqa: S608 (the SQL below is built from constants in this file only)

import json
import re
import sys
import time
import urllib.request
from pathlib import Path
from typing import Any

import duckdb  # type: ignore[import-not-found,unused-ignore]

from tripwise_api.integrations.local_places import IndexedPlace, write_index
from tripwise_api.planning.names import normalise
from tripwise_api.schemas.places import PlaceKind

CATALOG = "https://stac.overturemaps.org/catalog.json"
BUCKET = "s3://overturemaps-us-west-2/release"
OUTPUT = Path(__file__).resolve().parents[1] / "data" / "places-lb.sqlite"

COUNTRY = "LB"
WEST, SOUTH, EAST, NORTH = 35.09, 33.04, 36.65, 34.70
MIN_CONFIDENCE = 0.6
# Fewer places than this means the release changed shape: better to fail the deploy.
MIN_PLACES = 5000
ATTEMPTS = 3
RETRY_SECONDS = 20

TRAVEL_CATEGORIES = frozenset(
    [
        "restaurant",
        "cafe",
        "coffee_shop",
        "bakery",
        "bar",
        "pub",
        "lounge",
        "diner",
        "dessert_shop",
        "ice_cream_shop",
        "gelato_shop",
        "sandwich_shop",
        "steakhouse",
        "chocolatier",
        "smoothie_juice_bar",
        "tea_room",
        "wine_bar",
        "cocktail_bar",
        "winery",
        "brewery",
        "gastropub",
        "tapas_bar",
        "hookah_bar",
        "donut_shop",
        "delicatessen",
        "food_truck_stand",
        "farmers_market",
        "food_and_drink",
        "historic_site",
        "landmark_and_historical_building",
        "museum",
        "history_museum",
        "art_museum",
        "art_gallery",
        "monument",
        "castle",
        "palace",
        "cave",
        "waterfall",
        "beach",
        "beach_resort",
        "park",
        "national_park",
        "nature_reserve",
        "hiking_trail",
        "lake",
        "river",
        "mountain",
        "public_plaza",
        "public_fountain",
        "bridge",
        "marina",
        "ski_resort",
        "zoo",
        "aquarium",
        "amusement_park",
        "water_park",
        "botanical_garden",
        "garden",
        "theatre_venue",
        "music_venue",
        "cultural_center",
        "arts_and_entertainment",
        "shopping",
        "shopping_mall",
        "souvenir_store",
        "antique_store",
        "christian_place_of_worship",
        "roman_catholic_place_of_worship",
        "protestant_place_of_worship",
        "muslim_place_of_worship",
        "religious_organization",
        "hotel",
        "resort",
        "hostel",
        "bed_and_breakfast",
        "lodge",
        "lodging",
        "cottage",
        "campground",
        "scuba_diving_center",
    ]
)
TOWN_KINDS = {"locality": None, "neighborhood": None, "macrohood": None, "microhood": None}
TOWN_KINDS_WIDE = {"county": 15.0}
# English names travellers and models use for towns the data lists under another spelling.
TOWN_ALIASES = {
    "Jbeil": ["Byblos"],
    "Beit Ed Dine": ["Beiteddine", "Beit Eddine"],
    "Sidon": ["Saida"],
    "Tyre": ["Sour"],
    "Raoucheh": ["Raouche"],
    "Zahle": ["Zahleh"],
}


# A Latin name with its Arabic translation glued on ("Moussa castle" followed by Arabic).
_GLUED_TRANSLATION = re.compile(r"^([^\u0600-\u06ff]*[a-zA-Z][^\u0600-\u06ff]*)[\u0600-\u06ff].*$")


def tidy_name(name: str) -> str:
    glued = _GLUED_TRANSLATION.match(name)
    return glued[1].strip(" -|,") if glued else name


def latest_release() -> str:
    with urllib.request.urlopen(CATALOG, timeout=30) as response:
        release: str = json.load(response)["latest"]
    return release


def _source(release: str, theme: str, kind: str) -> str:
    path = f"{BUCKET}/{release}/theme={theme}/type={kind}/*"
    return f"read_parquet('{path}', hive_partitioning=1)"


def _in_box() -> str:
    return f"bbox.xmin BETWEEN {WEST} AND {EAST} AND bbox.ymin BETWEEN {SOUTH} AND {NORTH}"


def read_places(db: Any, release: str) -> list[IndexedPlace]:
    rows = db.execute(
        f"""
        SELECT names.primary, names.common['en'], names.common['ar'], taxonomy.primary,
               confidence, bbox.ymin, bbox.xmin, addresses[1].freeform, addresses[1].locality
        FROM {_source(release, "places", "place")}
        WHERE {_in_box()} AND addresses[1].country = '{COUNTRY}'
          AND confidence >= {MIN_CONFIDENCE}
          AND len(list_filter(sources, lambda s: s.dataset = 'Foursquare')) = 0
        ORDER BY confidence DESC
        """
    ).fetchall()
    seen: set[tuple[str, float, float]] = set()
    places: list[IndexedPlace] = []
    for name, english, arabic, category, _, lat, lng, street, locality in rows:
        if not name or category not in TRAVEL_CATEGORIES:
            continue
        # The same place is often listed more than once; the most confident record comes first.
        name = tidy_name(name)
        key = (normalise(name), round(lat, 3), round(lng, 3))
        if key in seen:
            continue
        seen.add(key)
        parts = dict.fromkeys(part for part in (street, locality, "Lebanon") if part)
        places.append(
            IndexedPlace(
                kind=PlaceKind.POI,
                name=name,
                name_en=english,
                name_ar=arabic,
                address=", ".join(parts),
                lat=lat,
                lng=lng,
            )
        )
    return places


def read_towns(db: Any, release: str) -> list[IndexedPlace]:
    sizes = {**TOWN_KINDS, **TOWN_KINDS_WIDE}
    kinds = ", ".join(f"'{kind}'" for kind in sizes)
    rows = db.execute(
        f"""
        SELECT names.primary, names.common['en'], names.common['ar'], subtype, bbox.ymin, bbox.xmin
        FROM {_source(release, "divisions", "division")}
        WHERE {_in_box()} AND country = '{COUNTRY}' AND subtype IN ({kinds})
        """
    ).fetchall()
    towns: list[IndexedPlace] = []
    for primary, english, arabic, subtype, lat, lng in rows:
        name = english or primary
        if not name:
            continue
        for shown in (name, *TOWN_ALIASES.get(name, [])):
            towns.append(
                IndexedPlace(
                    kind=PlaceKind.AREA,
                    name=shown,
                    name_en=shown,
                    name_ar=arabic,
                    address="Lebanon",
                    lat=lat,
                    lng=lng,
                    radius_km=sizes[subtype],
                )
            )
    return towns


def read_release(release: str) -> tuple[list[IndexedPlace], list[IndexedPlace]]:
    """Downloads can drop part-way, so the whole read is tried a few times."""
    for attempt in range(1, ATTEMPTS + 1):
        try:
            db = duckdb.connect()
            db.execute("INSTALL httpfs; LOAD httpfs; SET s3_region='us-west-2';")
            db.execute("SET http_retries=8; SET http_timeout=120;")
            return read_places(db, release), read_towns(db, release)
        except duckdb.IOException:
            if attempt == ATTEMPTS:
                raise
            time.sleep(RETRY_SECONDS)
    raise AssertionError("unreachable")


def main() -> None:
    output = Path(sys.argv[1]) if len(sys.argv) > 1 else OUTPUT
    release = latest_release()
    places, towns = read_release(release)
    if len(places) < MIN_PLACES:
        raise SystemExit(f"Only {len(places)} places in Overture release {release}")
    write_index(output, [*places, *towns])
    print(f"Overture {release}: {len(places)} places, {len(towns)} towns -> {output}")


if __name__ == "__main__":
    main()
