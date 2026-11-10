"""Group stops into days so each day stays in one part of town.

Balanced k-means: k is the number of days, each day takes at most `capacity` stops, and locked
stops never leave the day they are pinned to (they also pull their day's centre towards them).
Deterministic for a given input, so the same suggestions always give the same plan.
"""

import math
from collections.abc import Mapping, Sequence

from tripwise_api.domain.geo import Located, centroid, haversine_km
from tripwise_api.schemas.trip_request import GeoPoint

ITERATIONS = 8


def _seeds(
    items: Sequence[Located], k: int, anchors: Mapping[int, list[GeoPoint]]
) -> list[GeoPoint]:
    """Day centres to start from: a pinned day starts at its pinned stops, the others are picked
    by farthest-point sampling so they spread over the area."""
    seeds: dict[int, GeoPoint] = {day: centroid(points) for day, points in anchors.items()}
    pool = [item.location for item in items]
    if not seeds and pool:
        seeds[0] = pool[0]
    for day in range(k):
        if day in seeds:
            continue
        chosen = list(seeds.values())
        seeds[day] = max(pool, key=lambda p: min(haversine_km(p, c) for c in chosen))
    return [seeds[day] for day in range(k)]


def _regret(item: Located, centres: Sequence[GeoPoint]) -> float:
    distances = sorted(haversine_km(item.location, c) for c in centres)
    return distances[1] - distances[0] if len(distances) > 1 else 0.0


def assign_days(
    items: Sequence[Located],
    days: int,
    capacity: int,
    pinned: Mapping[str, int] | None = None,
) -> dict[str, int]:
    """Map each item key to a day in [0, days). `pinned` fixes some keys to a day."""
    pinned = dict(pinned or {})
    if days < 1:
        raise ValueError("need at least one day")
    if not items:
        return {}
    free = [item for item in items if item.key not in pinned]
    capacity = max(capacity, math.ceil(len(items) / days))
    anchors: dict[int, list[GeoPoint]] = {}
    for item in items:
        if item.key in pinned:
            anchors.setdefault(pinned[item.key], []).append(item.location)

    centres = _seeds(free or list(items), days, anchors)
    assignment: dict[str, int] = {}
    for _ in range(ITERATIONS):
        load = [len(anchors.get(day, [])) for day in range(days)]
        new_assignment: dict[str, int] = {}
        # Items with the most to lose from a bad choice pick first ("regret" ordering).
        by_regret = sorted(free, key=lambda item: _regret(item, centres), reverse=True)
        for item in by_regret:
            ranked = sorted(range(days), key=lambda d: haversine_km(item.location, centres[d]))
            day = next((d for d in ranked if load[d] < capacity), ranked[0])
            new_assignment[item.key] = day
            load[day] += 1
        if new_assignment == assignment:
            break
        assignment = new_assignment
        for day in range(days):
            members = [i.location for i in free if assignment[i.key] == day]
            members += anchors.get(day, [])
            if members:
                centres[day] = centroid(members)
    return {**assignment, **pinned}
