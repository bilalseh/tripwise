"""Lay grounded stops out over days: cluster by area, order to minimise walking, trim to pace."""

import math
from collections.abc import Sequence
from dataclasses import dataclass

from tripwise_api.domain.clustering import assign_days
from tripwise_api.domain.geo import Located
from tripwise_api.domain.ordering import order_stops
from tripwise_api.domain.pace import PACE_LIMITS, trim_day
from tripwise_api.schemas.trip import Stop
from tripwise_api.schemas.trip_request import Pace


@dataclass(frozen=True, slots=True)
class DraftDay:
    """A day as suggested, after grounding: its stops plus the AI's title and estimates."""

    title: str
    stops: list[Stop]


def regroup(drafts: Sequence[DraftDay], pace: Pace) -> list[list[Stop]]:
    """Reassign stops among the given days (all in one destination) so each day covers one
    area. Each resulting group goes to the suggested day it shares most stops with, so a day
    keeps its title and estimates when its stops stay together."""
    if len(drafts) < 2:
        return [list(d.stops) for d in drafts]
    origin = {stop.id: index for index, d in enumerate(drafts) for stop in d.stops}
    items = [Located(stop.id, stop.place.location) for d in drafts for stop in d.stops]
    pinned = {stop.id: origin[stop.id] for d in drafts for stop in d.stops if stop.locked}
    # Keep days balanced: at most one stop more than an even share, never above the pace.
    even = math.ceil(len(items) / len(drafts)) + 1
    assignment = assign_days(items, len(drafts), min(even, PACE_LIMITS[pace].max_stops), pinned)

    groups: list[list[Stop]] = [[] for _ in drafts]
    for d in drafts:
        for stop in d.stops:
            groups[assignment[stop.id]].append(stop)

    # A group holding locked stops was pinned to their day, so it stays there. The other groups
    # go to the free day they overlap most with (greedy, largest overlap first).
    order: list[int | None] = [None] * len(drafts)
    taken: set[int] = set()
    for g, group in enumerate(groups):
        if any(stop.locked for stop in group):
            order[g] = g
            taken.add(g)
    pairs = sorted(
        (
            (sum(origin[s.id] == day for s in group), g, day)
            for g, group in enumerate(groups)
            for day in range(len(drafts))
        ),
        key=lambda pair: (-pair[0], pair[1], pair[2]),
    )
    for _, g, day in pairs:
        if order[day] is None and g not in taken:
            order[day] = g
            taken.add(g)
    return [groups[g] if g is not None else [] for g in order]


def finish_day(
    stops: Sequence[Stop], pace: Pace, must_see: frozenset[str]
) -> tuple[list[Stop], list[Stop]]:
    """Order the day, then trim it to its pace. Returns (kept, trimmed)."""
    ordered = order_stops(stops)
    kept, trimmed = trim_day(ordered, pace, keep=must_see)
    return kept, trimmed
