"""Geocoders: Photon and Nominatim (both OpenStreetMap data), a cache, a fallback chain, and a
deterministic fake for tests and local development.

Usage policies respected here: an identifying User-Agent, results cached for 30 days, search
only on submit (never autocomplete), Nominatim spaced to one request per second app-wide.
"""

import logging
from typing import Any, Protocol

import httpx

from tripwise_api.domain.geo import haversine_km
from tripwise_api.integrations.throttle import Throttle
from tripwise_api.schemas.places import PlaceKind, PlaceResult
from tripwise_api.schemas.trip import Place, PlaceSource
from tripwise_api.schemas.trip_request import GeoPoint

logger = logging.getLogger(__name__)

USER_AGENT = "Tripwise/0.1 (+https://tripwise-plan.web.app; portfolio trip planner)"
ATTRIBUTION = "Search by OpenStreetMap data (Photon, Nominatim). © OpenStreetMap contributors"

# Result types that name an area rather than a specific place.
AREA_TYPES = frozenset(
    [
        "city",
        "town",
        "village",
        "hamlet",
        "municipality",
        "county",
        "state",
        "province",
        "region",
        "country",
        "district",
        "borough",
        "suburb",
        "quarter",
        "neighbourhood",
        "island",
        "administrative",
        "locality",
        "postcode",
    ]
)


class GeocodingError(Exception):
    """The geocoder could not be reached or refused the request."""


class Geocoder(Protocol):
    name: str

    async def search(
        self, query: str, near: GeoPoint | None, limit: int, language: str
    ) -> list[PlaceResult]: ...


def radius_from_box(south: float, north: float, west: float, east: float) -> float | None:
    """Half the diagonal of a bounding box, in km: how far an area reaches from its centre."""
    try:
        corner, opposite = GeoPoint(lat=south, lng=west), GeoPoint(lat=north, lng=east)
    except ValueError:
        return None
    return round(haversine_km(corner, opposite) / 2, 1)


# Bus stops and platforms are often named after the sight they serve; they are not stops.
TRANSIT = frozenset(
    [
        "bus_stop",
        "platform",
        "stop_position",
        "stop_area",
        "tram_stop",
        "halt",
        "subway_entrance",
        "taxi",
    ]
)


def _transit(*values: str | None) -> bool:
    return any(v in TRANSIT for v in values if v)


def _kind(*types: str | None) -> PlaceKind:
    return PlaceKind.AREA if any(t in AREA_TYPES for t in types if t) else PlaceKind.POI


async def _get_json(http: httpx.AsyncClient, url: str, params: dict[str, Any]) -> Any:
    try:
        response = await http.get(url, params=params, headers={"User-Agent": USER_AGENT})
    except httpx.HTTPError as error:
        raise GeocodingError(type(error).__name__) from error
    if response.is_error:
        raise GeocodingError(f"HTTP {response.status_code}")
    return response.json()


def _photon_radius(extent: Any) -> float | None:
    """Photon's extent is [west, north, east, south]."""
    if not (isinstance(extent, list) and len(extent) == 4):
        return None
    try:
        west, north, east, south = (float(v) for v in extent)
    except (TypeError, ValueError):
        return None
    return radius_from_box(south, north, west, east)


def _nominatim_radius(box: Any) -> float | None:
    """Nominatim's boundingbox is [south, north, west, east], as strings."""
    if not (isinstance(box, list) and len(box) == 4):
        return None
    try:
        south, north, west, east = (float(v) for v in box)
    except (TypeError, ValueError):
        return None
    return radius_from_box(south, north, west, east)


class PhotonGeocoder:
    """komoot's public Photon instance: designed for search, with a location bias."""

    name = "photon"
    URL = "https://photon.komoot.io/api/"
    LANGUAGES = frozenset({"en", "de", "fr"})

    def __init__(self, http: httpx.AsyncClient, throttle: Throttle) -> None:
        self._http = http
        self._throttle = throttle

    async def search(
        self, query: str, near: GeoPoint | None, limit: int, language: str
    ) -> list[PlaceResult]:
        params: dict[str, Any] = {"q": query, "limit": limit}
        if language in self.LANGUAGES:
            params["lang"] = language
        if near:
            params |= {"lat": near.lat, "lon": near.lng, "location_bias_scale": 0.4}
        async with self._throttle.slot():
            data = await _get_json(self._http, self.URL, params)
        return [r for r in (self._parse(f) for f in data.get("features", [])) if r]

    @staticmethod
    def _parse(feature: dict[str, Any]) -> PlaceResult | None:
        props = feature.get("properties") or {}
        coords = (feature.get("geometry") or {}).get("coordinates") or []
        name = props.get("name")
        if not name or len(coords) != 2 or _transit(props.get("osm_value"), props.get("type")):
            return None
        street = " ".join(p for p in (props.get("housenumber"), props.get("street")) if p)
        parts = [street, props.get("district"), props.get("city"), props.get("country")]
        address = ", ".join(dict.fromkeys(p for p in parts if p and p != name)) or name
        osm = f"{str(props.get('osm_type', ''))[:1]}{props.get('osm_id', '')}" or None
        return PlaceResult(
            place=Place(
                name=str(name)[:120],
                address=address[:300],
                location=GeoPoint(lat=coords[1], lng=coords[0]),
                osm_id=osm,
                source=PlaceSource.PHOTON,
            ),
            kind=_kind(props.get("type"), props.get("osm_value")),
            country=props.get("country"),
            country_code=str(props.get("countrycode", "")).lower() or None,
            radius_km=_photon_radius(props.get("extent")),
        )


class NominatimGeocoder:
    name = "nominatim"
    URL = "https://nominatim.openstreetmap.org/search"

    def __init__(self, http: httpx.AsyncClient, throttle: Throttle) -> None:
        self._http = http
        self._throttle = throttle

    async def search(
        self, query: str, near: GeoPoint | None, limit: int, language: str
    ) -> list[PlaceResult]:
        params: dict[str, Any] = {
            "q": query,
            "format": "jsonv2",
            "limit": limit,
            "addressdetails": 1,
            "accept-language": language,
        }
        if near:
            box = (near.lng - 0.4, near.lat + 0.3, near.lng + 0.4, near.lat - 0.3)
            params["viewbox"] = ",".join(f"{v:.4f}" for v in box)
        async with self._throttle.slot():
            data = await _get_json(self._http, self.URL, params)
        return [r for r in (self._parse(item) for item in data if isinstance(item, dict)) if r]

    @staticmethod
    def _parse(item: dict[str, Any]) -> PlaceResult | None:
        try:
            location = GeoPoint(lat=float(item["lat"]), lng=float(item["lon"]))
        except (KeyError, TypeError, ValueError):
            return None
        if _transit(item.get("type"), item.get("addresstype")):
            return None
        display = str(item.get("display_name", ""))
        name = item.get("name") or display.split(",")[0]
        if not name:
            return None
        address = item.get("address") or {}
        return PlaceResult(
            place=Place(
                name=str(name)[:120],
                address=display[:300],
                location=location,
                osm_id=f"{str(item.get('osm_type', ''))[:1].upper()}{item.get('osm_id', '')}",
                source=PlaceSource.NOMINATIM,
            ),
            kind=_kind(item.get("addresstype"), item.get("type")),
            country=address.get("country"),
            country_code=address.get("country_code"),
            radius_km=_nominatim_radius(item.get("boundingbox")),
        )
