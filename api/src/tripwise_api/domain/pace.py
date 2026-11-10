"""How much fits in a day for each pace, and trimming days that are overloaded."""

import itertools
from collections.abc import Sequence
from dataclasses import dataclass

from tripwise_api.domain.geo import estimate_leg
from tripwise_api.schemas.trip import Stop
from tripwise_api.schemas.trip_request import Pace


@dataclass(frozen=True, slots=True)
class PaceLimits:
    target_stops: int  # what the AI is asked for
    max_stops: int
    max_minutes: int  # visits plus travel between them


PACE_LIMITS = {
    Pace.RELAXED: PaceLimits(target_stops=3, max_stops=4, max_minutes=6 * 60),
    Pace.BALANCED: PaceLimits(target_stops=5, max_stops=6, max_minutes=8 * 60),
    Pace.PACKED: PaceLimits(target_stops=6, max_stops=8, max_minutes=10 * 60 + 30),
}


def day_minutes(stops: Sequence[Stop]) -> int:
    visits = sum(stop.duration_minutes for stop in stops)
    travel = sum(
        estimate_leg(a.place.location, b.place.location).minutes
        for a, b in itertools.pairwise(stops)
    )
    return visits + travel


def trim_day(
    stops: Sequence[Stop], pace: Pace, keep: frozenset[str] = frozenset()
) -> tuple[list[Stop], list[Stop]]:
    """Drop stops until the day fits its pace. Locked stops and ids in `keep` (must-see places)
    are never dropped; among the rest, the last-listed go first. Returns (kept, dropped)."""
    limits = PACE_LIMITS[pace]
    kept = list(stops)
    dropped: list[Stop] = []

    def protected(stop: Stop) -> bool:
        return stop.locked or stop.id in keep

    while len(kept) > limits.max_stops or (
        len(kept) > 1 and day_minutes(kept) > limits.max_minutes
    ):
        candidates = [s for s in kept if not protected(s)]
        if not candidates:
            break
        victim = candidates[-1]
        kept.remove(victim)
        dropped.append(victim)
    return kept, dropped


def is_overloaded(stops: Sequence[Stop], pace: Pace) -> bool:
    limits = PACE_LIMITS[pace]
    return len(stops) > limits.max_stops or day_minutes(stops) > limits.max_minutes
