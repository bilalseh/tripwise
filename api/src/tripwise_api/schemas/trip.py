"""A trip: the wizard answers plus the itinerary (days, stops), budget overrides and metadata.

Days and stops live inside the trip document, so every edit (and every undo) is one atomic
write of the whole itinerary. See docs/adr/0005.
"""

from datetime import date, datetime
from enum import StrEnum
from typing import Annotated

from pydantic import Field, StringConstraints

from tripwise_api.schemas.base import ApiModel, Identifier, Money, ShortText
from tripwise_api.schemas.trip_request import MAX_TRIP_DAYS, GeoPoint, TripRequest

MAX_STOPS_PER_DAY = 12
MAX_RAIN_STOPS = 6

LongText = Annotated[str, StringConstraints(strip_whitespace=True, max_length=500)]


class Slot(StrEnum):
    MORNING = "morning"
    AFTERNOON = "afternoon"
    EVENING = "evening"


class StopCategory(StrEnum):
    SIGHT = "sight"
    MUSEUM = "museum"
    FOOD = "food"
    NATURE = "nature"
    NIGHTLIFE = "nightlife"
    SHOPPING = "shopping"
    ACTIVITY = "activity"
    RELAX = "relax"


class PlaceSource(StrEnum):
    """Where the coordinates and address came from. Never the AI."""

    NOMINATIM = "nominatim"
    PHOTON = "photon"
    WIKIDATA = "wikidata"
    SEED = "seed"
    FAKE = "fake"


class Place(ApiModel):
    name: ShortText
    address: Annotated[str, StringConstraints(max_length=300)]
    location: GeoPoint
    osm_id: Annotated[str, StringConstraints(max_length=40)] | None = None
    source: PlaceSource


class Stop(ApiModel):
    id: Identifier
    place: Place
    category: StopCategory
    slot: Slot
    reason: LongText = ""
    duration_minutes: int = Field(ge=15, le=600, description="Estimate")
    cost_estimate: Money = Field(description="Estimate for the whole party, in trip currency")
    locked: bool = False
    note: LongText = ""


class DayEstimates(ApiModel):
    """AI estimates per day for the whole party. Activities come from the stops."""

    stay: Money = 0
    food: Money = 0
    transport: Money = 0


class Day(ApiModel):
    title: Annotated[str, StringConstraints(strip_whitespace=True, max_length=120)] = ""
    destination_index: int = Field(ge=0, le=2)
    stops: list[Stop] = Field(default_factory=list, max_length=MAX_STOPS_PER_DAY)
    rain_plan: list[Stop] = Field(default_factory=list, max_length=MAX_RAIN_STOPS)
    estimates: DayEstimates = Field(default_factory=DayEstimates)


class BudgetCategory(StrEnum):
    STAY = "stay"
    FOOD = "food"
    TRANSPORT = "transport"
    ACTIVITIES = "activities"


class BudgetOverride(ApiModel):
    """The user's own number for one day and category, replacing the estimate."""

    day: int = Field(ge=0, lt=MAX_TRIP_DAYS)
    category: BudgetCategory
    amount: Money


class TripStatus(StrEnum):
    DRAFT = "draft"  # wizard saved, itinerary not (fully) generated yet
    READY = "ready"


class GroundingReport(ApiModel):
    """What happened to the AI's suggestions on the way to the user."""

    provider: str
    suggested: int = Field(ge=0)
    kept: int = Field(ge=0)
    dropped: list[str] = Field(default_factory=list, max_length=60)
    trimmed: list[str] = Field(default_factory=list, max_length=60)
    unchecked: list[str] = Field(
        default_factory=list, max_length=60, description="Not verified before the time limit"
    )


class Trip(ApiModel):
    id: Identifier
    title: ShortText
    request: TripRequest
    status: TripStatus
    days: list[Day] = Field(default_factory=list, max_length=MAX_TRIP_DAYS)
    overrides: list[BudgetOverride] = Field(default_factory=list, max_length=200)
    version: int = Field(ge=0)
    created_at: datetime
    updated_at: datetime
    share_token: Identifier | None = None
    report: GroundingReport | None = None


class TripSummary(ApiModel):
    id: Identifier
    title: str
    destinations: list[str]
    start_date: date | None
    total_days: int
    status: TripStatus
    stops: int
    updated_at: datetime


class CreateTripRequest(ApiModel):
    title: ShortText | None = None
    request: TripRequest


class SaveTripRequest(ApiModel):
    """The editable parts of a trip, saved together. `base_version` guards against overwriting
    a newer save from another tab."""

    base_version: int = Field(ge=0)
    title: ShortText
    days: list[Day] = Field(max_length=MAX_TRIP_DAYS)
    overrides: list[BudgetOverride] = Field(default_factory=list, max_length=200)


class GenerateRequest(ApiModel):
    """Generate days [first_day, first_day + day_count). Long trips are generated in batches,
    so each request fits well inside the 60-second Hosting timeout."""

    first_day: int = Field(ge=0, lt=MAX_TRIP_DAYS)
    day_count: int = Field(ge=1, le=4)


class DuplicateTripRequest(ApiModel):
    title: ShortText | None = None
    start_date: date | None = None
