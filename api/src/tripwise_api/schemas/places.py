from enum import StrEnum

from pydantic import Field

from tripwise_api.schemas.base import ApiModel
from tripwise_api.schemas.trip import Place
from tripwise_api.schemas.trip_request import GeoPoint


class PlaceKind(StrEnum):
    POI = "poi"  # a specific place: a museum, a park, a restaurant
    AREA = "area"  # a city, region or country


class PlaceResult(ApiModel):
    place: Place
    kind: PlaceKind
    country: str | None = None
    country_code: str | None = None


class PlaceSearchResponse(ApiModel):
    results: list[PlaceResult]
    attribution: str


class TravelSource(StrEnum):
    OSRM = "osrm"  # road routing from the OSRM demo server
    ESTIMATE = "estimate"  # straight-line distance with a detour factor


class TravelMode(StrEnum):
    WALK = "walk"
    DRIVE = "drive"


class TravelRequest(ApiModel):
    points: list[GeoPoint] = Field(min_length=2, max_length=13)


class TravelLeg(ApiModel):
    minutes: int
    km: float
    mode: TravelMode
    source: TravelSource


class TravelResponse(ApiModel):
    legs: list[TravelLeg]
