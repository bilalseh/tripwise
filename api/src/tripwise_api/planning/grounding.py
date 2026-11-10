"""Turn AI suggestions into real places, or drop them.

A suggestion survives only if the geocoder finds a specific place (not just a city) with that
name within MAX_KM of the destination. The coordinates, address and name shown to the user are
the geocoder's, never the AI's.
"""

import asyncio
import logging
from collections.abc import Callable, Iterable, Sequence
from dataclasses import dataclass, field

from tripwise_api.domain.geo import haversine_km
from tripwise_api.integrations.geocoding import Geocoder, GeocodingError
from tripwise_api.planning.ai_models import AiStop
from tripwise_api.schemas.places import PlaceKind, PlaceResult
from tripwise_api.schemas.trip import Stop
from tripwise_api.schemas.trip_request import Destination

logger = logging.getLogger(__name__)

# Day trips are fine (Sintra is 25 km from Lisbon); another city is not.
MAX_KM = 60.0

NewId = Callable[[], str]


@dataclass
class GroundingLog:
    suggested: int = 0
    dropped: list[str] = field(default_factory=list)

    def drop(self, name: str) -> None:
        self.dropped.append(name)


def _pick(results: Iterable[PlaceResult], destination: Destination) -> PlaceResult | None:
    for result in results:
        if result.kind is not PlaceKind.POI:
            continue
        if haversine_km(result.place.location, destination.location) <= MAX_KM:
            return result
    return None


async def find_place(
    geocoder: Geocoder, name: str, area: str, destination: Destination, language: str
) -> PlaceResult | None:
    queries = [f"{name}, {area}" if area else f"{name}, {destination.name}"]
    if area and area.lower() != destination.name.lower():
        queries.append(f"{name}, {destination.name}")
    for query in queries:
        try:
            results = await geocoder.search(query, destination.location, 5, language)
        except GeocodingError:
            logger.warning("geocoding failed for a suggestion; dropping it")
            return None
        picked = _pick(results, destination)
        if picked:
            return picked
    return None


async def ground_stop(
    geocoder: Geocoder, suggestion: AiStop, destination: Destination, language: str, new_id: NewId
) -> Stop | None:
    found = await find_place(geocoder, suggestion.name, suggestion.area, destination, language)
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
    geocoder: Geocoder,
    suggestions: Sequence[tuple[AiStop, Destination]],
    language: str,
    new_id: NewId,
) -> list[Stop | None]:
    """Ground suggestions concurrently (each geocoder throttles itself to its usage policy).
    The result lines up with the input; None marks a suggestion that was not found."""
    return list(
        await asyncio.gather(
            *(ground_stop(geocoder, s, d, language, new_id) for s, d in suggestions)
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
