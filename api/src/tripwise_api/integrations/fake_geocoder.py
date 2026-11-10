"""A deterministic geocoder for tests, local development and E2E runs: no network.

Known cities resolve to their real centres. Any other query resolves to a point a few
kilometres from the bias location, derived from a hash of the query, so the same name always
lands in the same spot. Queries containing "invented" resolve to nothing, which lets tests
exercise the "unresolved suggestion is dropped" path.
"""

import hashlib

from tripwise_api.schemas.places import PlaceKind, PlaceResult
from tripwise_api.schemas.trip import Place, PlaceSource
from tripwise_api.schemas.trip_request import GeoPoint

CITIES: dict[str, tuple[str, str, float, float]] = {
    "lisbon": ("Portugal", "pt", 38.7223, -9.1393),
    "porto": ("Portugal", "pt", 41.1579, -8.6291),
    "copenhagen": ("Denmark", "dk", 55.6761, 12.5683),
    "paris": ("France", "fr", 48.8566, 2.3522),
    "rome": ("Italy", "it", 41.9028, 12.4964),
    "barcelona": ("Spain", "es", 41.3874, 2.1686),
    "tokyo": ("Japan", "jp", 35.6762, 139.6503),
    "kyoto": ("Japan", "jp", 35.0116, 135.7681),
    "beirut": ("Lebanon", "lb", 33.8938, 35.5018),
    "new york": ("United States", "us", 40.7128, -74.0060),
}


def _offset(text: str) -> tuple[float, float]:
    digest = hashlib.sha256(text.lower().encode()).digest()
    # Up to about 3 km in each direction.
    return (digest[0] - 128) / 128 * 0.027, (digest[1] - 128) / 128 * 0.035


class FakeGeocoder:
    name = "fake"

    async def search(
        self, query: str, near: GeoPoint | None, limit: int, language: str
    ) -> list[PlaceResult]:
        text = query.strip()
        if not text or "invented" in text.lower():
            return []
        head = text.split(",")[0].strip()
        city = CITIES.get(head.lower())
        if city:
            country, code, lat, lng = city
            return [
                PlaceResult(
                    place=Place(
                        name=head.title(),
                        address=f"{head.title()}, {country}",
                        location=GeoPoint(lat=lat, lng=lng),
                        osm_id=None,
                        source=PlaceSource.FAKE,
                    ),
                    kind=PlaceKind.AREA,
                    country=country,
                    country_code=code,
                )
            ][:limit]
        base = near or GeoPoint(lat=0, lng=0)
        d_lat, d_lng = _offset(head)
        area = text.split(",")[1].strip() if "," in text else "Test City"
        return [
            PlaceResult(
                place=Place(
                    name=head[:120],
                    address=f"{head[:80]}, {area[:80]} (test data)",
                    location=GeoPoint(lat=base.lat + d_lat, lng=base.lng + d_lng),
                    osm_id=None,
                    source=PlaceSource.FAKE,
                ),
                kind=PlaceKind.POI,
            )
        ][:limit]
