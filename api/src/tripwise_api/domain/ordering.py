"""Order a day's stops to keep walking short, without breaking the time-of-day slots.

Stops are grouped by slot (morning, afternoon, evening). Within each slot a nearest-neighbour
tour continues from wherever the previous slot ended, then 2-opt removes crossings.
"""

from collections.abc import Sequence

from tripwise_api.domain.geo import haversine_km, path_km
from tripwise_api.schemas.trip import Slot, Stop
from tripwise_api.schemas.trip_request import GeoPoint

SLOT_ORDER = (Slot.MORNING, Slot.AFTERNOON, Slot.EVENING)


def _nearest_neighbour(stops: list[Stop], start: GeoPoint | None) -> list[Stop]:
    remaining = list(stops)
    tour: list[Stop] = []
    position = start
    while remaining:
        if position is None:
            following = remaining.pop(0)
        else:
            here = position
            following = min(remaining, key=lambda s: haversine_km(here, s.place.location))
            remaining.remove(following)
        tour.append(following)
        position = following.place.location
    return tour


def _two_opt(tour: list[Stop], start: GeoPoint | None) -> list[Stop]:
    def length(candidate: Sequence[Stop]) -> float:
        points = [s.place.location for s in candidate]
        return path_km([start, *points] if start else points)

    best = list(tour)
    improved = True
    while improved:
        improved = False
        for i in range(len(best) - 1):
            for j in range(i + 2, len(best) + 1):
                candidate = best[:i] + best[i:j][::-1] + best[j:]
                if length(candidate) < length(best) - 1e-9:
                    best, improved = candidate, True
    return best


def order_stops(stops: Sequence[Stop], start: GeoPoint | None = None) -> list[Stop]:
    """Return the stops in visiting order. Locked stops are ordered like any other: locking
    keeps a stop on its day, not at a fixed position."""
    ordered: list[Stop] = []
    position = start
    for slot in SLOT_ORDER:
        group = [s for s in stops if s.slot is slot]
        if not group:
            continue
        tour = _two_opt(_nearest_neighbour(group, position), position)
        ordered.extend(tour)
        position = tour[-1].place.location
    return ordered


def total_km(stops: Sequence[Stop]) -> float:
    return path_km([s.place.location for s in stops])
