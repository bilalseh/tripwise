"""Distances and straight-line travel estimates. Mirrors shared/src/domain/travel.ts."""

import itertools
import math
from collections.abc import Sequence
from dataclasses import dataclass

from tripwise_api.schemas.places import TravelLeg, TravelMode, TravelSource
from tripwise_api.schemas.trip_request import GeoPoint

EARTH_RADIUS_KM = 6371.0088
# Streets are not straight: a typical city route is about 30% longer than the crow flies.
DETOUR_FACTOR = 1.3
WALK_KMH = 4.5
DRIVE_KMH = 25.0  # urban average including traffic and parking
DRIVE_OVERHEAD_MINUTES = 5
# Above this (routed) distance a leg is assumed to be driven or taken by transit.
WALK_LIMIT_KM = 2.0


def haversine_km(a: GeoPoint, b: GeoPoint) -> float:
    d_lat = math.radians(b.lat - a.lat)
    d_lng = math.radians(b.lng - a.lng)
    h = (
        math.sin(d_lat / 2) ** 2
        + math.cos(math.radians(a.lat)) * math.cos(math.radians(b.lat)) * math.sin(d_lng / 2) ** 2
    )
    return 2 * EARTH_RADIUS_KM * math.asin(min(1.0, math.sqrt(h)))


def centroid(points: Sequence[GeoPoint]) -> GeoPoint:
    """Mean position. Fine at city scale, where the antimeridian never gets in the way."""
    if not points:
        raise ValueError("centroid of no points")
    return GeoPoint(
        lat=sum(p.lat for p in points) / len(points),
        lng=sum(p.lng for p in points) / len(points),
    )


def estimate_leg(a: GeoPoint, b: GeoPoint) -> TravelLeg:
    km = haversine_km(a, b) * DETOUR_FACTOR
    if km <= WALK_LIMIT_KM:
        minutes = km / WALK_KMH * 60
        mode = TravelMode.WALK
    else:
        minutes = km / DRIVE_KMH * 60 + DRIVE_OVERHEAD_MINUTES
        mode = TravelMode.DRIVE
    return TravelLeg(
        minutes=max(1, round(minutes)), km=round(km, 2), mode=mode, source=TravelSource.ESTIMATE
    )


@dataclass(frozen=True, slots=True)
class Located:
    """Anything with a position, for the clustering and ordering helpers."""

    key: str
    location: GeoPoint


def path_km(points: Sequence[GeoPoint]) -> float:
    return sum(haversine_km(a, b) for a, b in itertools.pairwise(points))
