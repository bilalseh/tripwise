"""A local index of real places, built from Overture Maps data by `scripts/build_places.py`.

Searching it is instant and has no rate limit, so it is tried before the online geocoders for
the destinations it covers. It holds travel-related places and towns only: names, positions and
a short address, with no phone numbers, emails or websites.
"""

import logging
import math
import sqlite3
from collections.abc import Iterable
from dataclasses import dataclass
from pathlib import Path

from tripwise_api.domain.geo import haversine_km
from tripwise_api.planning.names import (
    GENERIC,
    STOPWORDS,
    closely_matches,
    normalise,
    similarity,
)
from tripwise_api.schemas.places import PlaceKind, PlaceResult
from tripwise_api.schemas.trip import Place, PlaceSource
from tripwise_api.schemas.trip_request import GeoPoint

logger = logging.getLogger(__name__)

ATTRIBUTION = (
    "Search by Overture Maps and OpenStreetMap data. "
    "© Overture Maps Foundation, © OpenStreetMap contributors"
)
# Grid used to tell which destinations the index covers (about 5 km per cell).
CELL_DEGREES = 0.05
# Candidates read from the index before ranking them by name and distance.
CANDIDATES = 300

SCHEMA = """
CREATE TABLE places (
    id INTEGER PRIMARY KEY,
    kind TEXT NOT NULL,
    name TEXT NOT NULL,
    name_en TEXT,
    name_ar TEXT,
    address TEXT NOT NULL,
    lat REAL NOT NULL,
    lng REAL NOT NULL,
    radius_km REAL
);
CREATE VIRTUAL TABLE places_fts USING fts5(
    name, name_en, name_ar,
    content='places', content_rowid='id',
    tokenize='unicode61 remove_diacritics 2'
);
CREATE TABLE cells (cell TEXT PRIMARY KEY) WITHOUT ROWID;
"""


@dataclass(frozen=True, slots=True)
class IndexedPlace:
    kind: PlaceKind
    name: str
    address: str
    lat: float
    lng: float
    name_en: str | None = None
    name_ar: str | None = None
    radius_km: float | None = None


def _cell(lat: float, lng: float) -> tuple[int, int]:
    return math.floor(lat / CELL_DEGREES), math.floor(lng / CELL_DEGREES)


def write_index(path: Path, places: Iterable[IndexedPlace]) -> int:
    """Create the index file, replacing any earlier one. Returns the number of places."""
    path.parent.mkdir(parents=True, exist_ok=True)
    path.unlink(missing_ok=True)
    rows = list(places)
    with sqlite3.connect(path) as db:
        db.executescript(SCHEMA)
        db.executemany(
            "INSERT INTO places (kind, name, name_en, name_ar, address, lat, lng, radius_km) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (
                (p.kind.value, p.name, p.name_en, p.name_ar, p.address, p.lat, p.lng, p.radius_km)
                for p in rows
            ),
        )
        db.execute("INSERT INTO places_fts (places_fts) VALUES ('rebuild')")
        cells = {_cell(p.lat, p.lng) for p in rows}
        db.executemany("INSERT INTO cells VALUES (?)", ((f"{a}:{b}",) for a, b in cells))
    db.close()
    return len(rows)


def _search_words(name: str) -> list[str]:
    """The words that identify a place, or all of them when every word is generic."""
    words = [word for word in normalise(name).split() if word not in STOPWORDS]
    return [word for word in words if word not in GENERIC] or words


class LocalPlaces:
    """Implements the Geocoder protocol over the read-only index file."""

    name = "overture"

    def __init__(self, path: Path) -> None:
        uri = f"{path.resolve().as_uri()}?immutable=1"
        self._db = sqlite3.connect(uri, uri=True, check_same_thread=False)
        self._db.row_factory = sqlite3.Row
        self._cells = frozenset(row[0] for row in self._db.execute("SELECT cell FROM cells"))
        logger.info("local places index loaded: %d map cells", len(self._cells))

    def close(self) -> None:
        self._db.close()

    def covers(self, point: GeoPoint) -> bool:
        """Whether the index has places at this point or right next to it."""
        lat, lng = _cell(point.lat, point.lng)
        return any(f"{lat + a}:{lng + b}" in self._cells for a in (-1, 0, 1) for b in (-1, 0, 1))

    async def search(
        self, query: str, near: GeoPoint | None, limit: int, language: str
    ) -> list[PlaceResult]:
        """Places sharing a word with the name before the first comma, best match first."""
        wanted = query.split(",")[0].strip()
        words = _search_words(wanted)
        if not words:
            return []
        match = " OR ".join(f'"{word}"*' for word in words)
        rows = self._db.execute(
            "SELECT p.* FROM places_fts JOIN places p ON p.id = places_fts.rowid "
            "WHERE places_fts MATCH ? ORDER BY bm25(places_fts) LIMIT ?",
            (match, CANDIDATES),
        ).fetchall()
        results = [_result(row, language) for row in rows]
        ranked = sorted(results, key=lambda r: _rank(r, wanted, near))
        # Places that merely share a word are only worth showing when nothing closer exists.
        close = [r for r in ranked if _is_close(r, wanted)]
        return (close or ranked)[:limit]


def _is_close(result: PlaceResult, wanted: str) -> bool:
    names = [result.place.name, *([result.also_known_as] if result.also_known_as else [])]
    return any(closely_matches(wanted, name) for name in names)


def _rank(
    result: PlaceResult, wanted: str, near: GeoPoint | None
) -> tuple[bool, bool, float, float]:
    names = [result.place.name, *([result.also_known_as] if result.also_known_as else [])]
    exact = any(normalise(name) == normalise(wanted) for name in names)
    score = max(similarity(wanted, name) for name in names)
    distance = haversine_km(result.place.location, near) if near else 0.0
    return (not exact, not _is_close(result, wanted), -score, distance)


def _result(row: sqlite3.Row, language: str) -> PlaceResult:
    primary: str = row["name"]
    english: str | None = row["name_en"]
    arabic: str | None = row["name_ar"]
    shown = (arabic if language == "ar" else english) or primary
    # Only names in Latin script are offered for matching: other scripts cannot be compared.
    other = next(
        (n for n in (english, primary) if n and n != shown and n.isascii()),
        None,
    )
    return PlaceResult(
        place=Place(
            name=shown[:120],
            address=str(row["address"])[:300],
            location=GeoPoint(lat=row["lat"], lng=row["lng"]),
            osm_id=None,
            source=PlaceSource.OVERTURE,
        ),
        kind=PlaceKind(row["kind"]),
        country="Lebanon",
        country_code="lb",
        radius_km=row["radius_km"],
        also_known_as=other,
    )
