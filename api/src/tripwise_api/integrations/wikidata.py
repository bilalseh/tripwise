"""Wikidata as a second lookup for well-known places (free, no key).

Used only when OpenStreetMap search finds no acceptable match. It knows landmarks under many
names and languages, with coordinates (property P625). Two small API calls per search: find
items by label, then read their coordinates. Results are cached like any geocoder's.
"""

import re
from typing import Any

import httpx

from tripwise_api.integrations.geocoding import USER_AGENT, GeocodingError
from tripwise_api.integrations.throttle import Throttle
from tripwise_api.schemas.places import PlaceKind, PlaceResult
from tripwise_api.schemas.trip import Place, PlaceSource
from tripwise_api.schemas.trip_request import GeoPoint

API = "https://www.wikidata.org/w/api.php"
ATTRIBUTION = "Wikidata (CC0)"

# Descriptions that start like these name an area, not a specific place.
_AREA = re.compile(
    r"^(human settlement|city|town|village|capital|country|sovereign state|municipality|"
    r"district|region|province|state|county|parish|neighbou?rhood|quarter|island|commune)\b",
    re.IGNORECASE,
)


def _coordinates(entity: dict[str, Any]) -> GeoPoint | None:
    try:
        value = entity["claims"]["P625"][0]["mainsnak"]["datavalue"]["value"]
        return GeoPoint(lat=float(value["latitude"]), lng=float(value["longitude"]))
    except (KeyError, IndexError, TypeError, ValueError):
        return None


class WikidataGeocoder:
    name = "wikidata"

    def __init__(self, http: httpx.AsyncClient, throttle: Throttle) -> None:
        self._http = http
        self._throttle = throttle

    async def _call(self, params: dict[str, str | int]) -> Any:
        try:
            async with self._throttle.slot():
                response = await self._http.get(
                    API, params={**params, "format": "json"}, headers={"User-Agent": USER_AGENT}
                )
        except httpx.HTTPError as error:
            raise GeocodingError(type(error).__name__) from error
        if response.is_error:
            raise GeocodingError(f"HTTP {response.status_code}")
        return response.json()

    async def search(
        self, query: str, near: GeoPoint | None, limit: int, language: str
    ) -> list[PlaceResult]:
        # Labels are matched as typed; the ", City" suffix used for map search would not match.
        term = query.split(",")[0].strip()
        if len(term) < 2:
            return []
        found = await self._call(
            {
                "action": "wbsearchentities",
                "search": term,
                "language": language,
                "uselang": language,
                "type": "item",
                "limit": min(limit, 7),
            }
        )
        hits = [hit for hit in found.get("search", []) if isinstance(hit, dict) and hit.get("id")]
        if not hits:
            return []
        details = await self._call(
            {
                "action": "wbgetentities",
                "ids": "|".join(str(hit["id"]) for hit in hits),
                "props": "claims",
            }
        )
        entities = details.get("entities", {})
        results: list[PlaceResult] = []
        for hit in hits:
            location = _coordinates(entities.get(hit["id"], {}))
            label = str(hit.get("label") or term)[:120]
            if location is None:
                continue
            description = str(hit.get("description") or "")
            matched = (hit.get("match") or {}).get("text")
            results.append(
                PlaceResult(
                    place=Place(
                        name=label,
                        address=(description[:1].upper() + description[1:])[:300] or label,
                        location=location,
                        osm_id=None,
                        source=PlaceSource.WIKIDATA,
                    ),
                    kind=PlaceKind.AREA if _AREA.match(description) else PlaceKind.POI,
                    also_known_as=str(matched)[:120] if matched and matched != label else None,
                )
            )
        return results
