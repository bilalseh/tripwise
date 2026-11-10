"""Turn AI suggestions into real places, or drop them.

A suggestion survives only if a lookup (OpenStreetMap first, then Wikidata) finds a specific
place, not just a city, whose name resembles the suggestion and which lies within the
destination's search radius. The coordinates, address and name shown to the user are the
lookup's, never the AI's.
"""

import asyncio
import logging
from collections.abc import Callable, Iterable, Sequence
from dataclasses import dataclass, field

from tripwise_api.domain.geo import haversine_km
from tripwise_api.integrations.geocoding import Geocoder, GeocodingError
from tripwise_api.planning.ai_models import AiStop
from tripwise_api.planning.names import name_variants, names_match
from tripwise_api.schemas.places import PlaceKind, PlaceResult
from tripwise_api.schemas.trip import Stop
from tripwise_api.schemas.trip_request import Destination

logger = logging.getLogger(__name__)

# Day trips are fine (Sintra is 25 km from Lisbon); another city is not.
CITY_KM = 60.0
# A whole country picked as the destination, when its size is unknown (older trips).
COUNTRY_KM = 250.0
MAX_KM = 400.0
# Searches per suggestion and lookup, so invented names cannot burn through rate limits.
QUERIES_PER_LOOKUP = 4

NewId = Callable[[], str]
Lookups = Geocoder | Sequence[Geocoder]


@dataclass
class GroundingLog:
    suggested: int = 0
    dropped: list[str] = field(default_factory=list)

    def drop(self, name: str) -> None:
        self.dropped.append(name)


def search_radius_km(destination: Destination) -> float:
    """How far from the destination's centre a place may be: its own size when known (a
    country covers far more than a city), else a city-sized radius."""
    if destination.radius_km:
        return max(CITY_KM, min(destination.radius_km * 1.15, MAX_KM))
    country = (destination.country or "").casefold()
    if country and destination.name.casefold() == country:
        return COUNTRY_KM
    return CITY_KM


def _as_list(lookups: Lookups) -> list[Geocoder]:
    return list(lookups) if isinstance(lookups, Sequence) else [lookups]


def _pick(
    results: Iterable[PlaceResult], wanted: Sequence[str], destination: Destination, radius: float
) -> PlaceResult | None:
    for result in results:
        if result.kind is not PlaceKind.POI:
            continue
        names = [result.place.name, *([result.also_known_as] if result.also_known_as else [])]
        if not any(names_match(name, found) for name in wanted for found in names):
            continue
        if haversine_km(result.place.location, destination.location) <= radius:
            return result
    return None


def _queries(name: str, area: str, destination: Destination) -> list[tuple[str, str]]:
    """(query, variant) pairs: the full name near the area hint and the destination, then
    simpler forms of the name near the destination."""
    pairs: list[tuple[str, str]] = []
    variants = name_variants(name)
    if area and area.casefold() != destination.name.casefold():
        pairs.append((f"{variants[0]}, {area}", variants[0]))
    pairs.extend((f"{variant}, {destination.name}", variant) for variant in variants)
    return pairs[:QUERIES_PER_LOOKUP]


async def find_place(
    lookups: Lookups, name: str, area: str, destination: Destination, language: str
) -> PlaceResult | None:
    radius = search_radius_km(destination)
    for geocoder in _as_list(lookups):
        for query, variant in _queries(name, area, destination):
            try:
                results = await geocoder.search(query, destination.location, 5, language)
            except GeocodingError:
                logger.warning("%s failed for a suggestion; trying the next lookup", geocoder.name)
                break
            picked = _pick(results, (name, variant), destination, radius)
            if picked:
                return picked
    return None


async def ground_stop(
    lookups: Lookups, suggestion: AiStop, destination: Destination, language: str, new_id: NewId
) -> Stop | None:
    found = await find_place(lookups, suggestion.name, suggestion.area, destination, language)
    if found is None:
        return None
    return Stop(
        id=new_id(),
        place=found.place,
        category=suggestion.category,
        slot=suggestion.slot,
        reason=suggestion.reason,
        duration_minutes=suggestion.duration_minutes,
        cost_estimate=suggestion.cost_estimate,
    )


async def ground_many(
    lookups: Lookups,
    suggestions: Sequence[tuple[AiStop, Destination]],
    language: str,
    new_id: NewId,
) -> list[Stop | None]:
    """Ground suggestions concurrently (each lookup throttles itself to its usage policy).
    The result lines up with the input; None marks a suggestion that was not found."""
    return list(
        await asyncio.gather(
            *(ground_stop(lookups, s, d, language, new_id) for s, d in suggestions)
        )
    )


def keep_found(
    suggestions: Sequence[AiStop],
    grounded: Sequence[Stop | None],
    log: GroundingLog,
    seen: set[str],
) -> list[Stop | None]:
    """Blank out unresolved suggestions (logged as dropped) and repeats of places already in
    `seen`. The result lines up with `suggestions`."""
    log.suggested += len(suggestions)
    kept: list[Stop | None] = []
    for suggestion, stop in zip(suggestions, grounded, strict=True):
        if stop is None:
            log.drop(suggestion.name)
            kept.append(None)
            continue
        identity = place_identity(stop)
        kept.append(None if identity in seen else stop)
        seen.add(identity)
    return kept


def present(stops: Sequence[Stop | None]) -> list[Stop]:
    return [stop for stop in stops if stop is not None]


def place_identity(stop: Stop) -> str:
    location = stop.place.location
    return stop.place.osm_id or f"{stop.place.name.lower()}@{location.lat:.4f},{location.lng:.4f}"
