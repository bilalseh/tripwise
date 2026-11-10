"""Clustering, ordering, pace limits and travel estimates."""

from tests.stops import stop
from tripwise_api.domain.clustering import assign_days
from tripwise_api.domain.geo import Located, estimate_leg, haversine_km
from tripwise_api.domain.ordering import order_stops, total_km
from tripwise_api.domain.pace import PACE_LIMITS, day_minutes, is_overloaded, trim_day
from tripwise_api.schemas.places import TravelMode, TravelSource
from tripwise_api.schemas.trip import Slot
from tripwise_api.schemas.trip_request import GeoPoint, Pace

WEST = [GeoPoint(lat=38.70, lng=-9.21 + i * 0.002) for i in range(3)]
EAST = [GeoPoint(lat=38.71, lng=-9.13 + i * 0.002) for i in range(3)]


def test_haversine_matches_a_known_distance() -> None:
    lisbon, porto = GeoPoint(lat=38.7223, lng=-9.1393), GeoPoint(lat=41.1579, lng=-8.6291)
    assert round(haversine_km(lisbon, porto)) == 274


def test_short_legs_are_walked_and_long_ones_driven_both_labelled_estimates() -> None:
    near = estimate_leg(WEST[0], WEST[1])
    far = estimate_leg(WEST[0], EAST[0])

    assert near.mode is TravelMode.WALK
    assert near.source is TravelSource.ESTIMATE
    assert far.mode is TravelMode.DRIVE
    assert far.minutes > near.minutes


def test_clustering_puts_each_neighbourhood_on_its_own_day() -> None:
    mixed = [Located(f"w{i}", p) for i, p in enumerate(WEST)] + [
        Located(f"e{i}", p) for i, p in enumerate(EAST)
    ]
    # Interleave so the input order gives no hint.
    items = [mixed[0], mixed[3], mixed[1], mixed[4], mixed[2], mixed[5]]

    days = assign_days(items, days=2, capacity=3)

    assert {days["w0"], days["w1"], days["w2"]} != {days["e0"]}
    assert len({days["w0"], days["w1"], days["w2"]}) == 1
    assert len({days["e0"], days["e1"], days["e2"]}) == 1


def test_clustering_respects_capacity_and_pins() -> None:
    items = [Located(f"w{i}", p) for i, p in enumerate(WEST)] + [Located("e0", EAST[0])]

    days = assign_days(items, days=2, capacity=2, pinned={"w0": 1})

    assert days["w0"] == 1
    assert sum(1 for d in days.values() if d == 0) <= 2
    assert sum(1 for d in days.values() if d == 1) <= 2


def test_clustering_with_no_items_is_empty() -> None:
    assert assign_days([], days=3, capacity=4) == {}


def test_ordering_keeps_slots_and_shortens_the_walk() -> None:
    a = stop("a", WEST[0], Slot.MORNING)
    b = stop("b", EAST[2], Slot.MORNING)
    c = stop("c", WEST[2], Slot.MORNING)
    d = stop("d", EAST[0], Slot.EVENING)
    e = stop("e", WEST[1], Slot.AFTERNOON)

    ordered = order_stops([b, d, a, e, c])

    assert [s.slot for s in ordered] == [Slot.MORNING] * 3 + [Slot.AFTERNOON, Slot.EVENING]
    assert total_km(ordered[:3]) <= total_km([a, b, c])


def test_two_opt_removes_a_crossing() -> None:
    square = [
        GeoPoint(lat=0, lng=0),
        GeoPoint(lat=0, lng=0.01),
        GeoPoint(lat=0.01, lng=0.01),
        GeoPoint(lat=0.01, lng=0),
    ]
    crossing = [
        stop("p0", square[0]),
        stop("p2", square[2]),
        stop("p1", square[1]),
        stop("p3", square[3]),
    ]

    ordered = order_stops(crossing, start=square[0])

    assert total_km(ordered) < total_km(crossing)


def test_trimming_drops_the_last_unprotected_stops_first() -> None:
    stops = [stop(f"s{i}", WEST[0], minutes=120) for i in range(6)]
    stops[5] = stop("s5", WEST[0], minutes=120, locked=True)

    kept, dropped = trim_day(stops, Pace.RELAXED, keep=frozenset({"s4"}))

    assert {s.id for s in kept} >= {"s4", "s5"}
    assert len(kept) <= PACE_LIMITS[Pace.RELAXED].max_stops
    assert day_minutes(kept) <= PACE_LIMITS[Pace.RELAXED].max_minutes
    assert next(s.id for s in dropped) == "s3"


def test_a_day_of_only_locked_stops_is_never_trimmed() -> None:
    stops = [stop(f"s{i}", WEST[0], minutes=300, locked=True) for i in range(3)]

    kept, dropped = trim_day(stops, Pace.RELAXED)

    assert len(kept) == 3
    assert dropped == []
    assert is_overloaded(kept, Pace.RELAXED)
