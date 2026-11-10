"""The trip wizard's answers. Every field here comes from the user and is validated strictly."""

from datetime import date
from enum import StrEnum
from typing import Annotated

from pydantic import Field, StringConstraints, field_validator, model_validator

from tripwise_api.schemas.base import ApiModel, Currency, Money, ShortText

MAX_TRIP_DAYS = 14
MAX_DESTINATIONS = 3


class Party(StrEnum):
    SOLO = "solo"
    COUPLE = "couple"
    FAMILY = "family"
    FRIENDS = "friends"


class BudgetLevel(StrEnum):
    BUDGET = "budget"
    MODERATE = "moderate"
    LUXURY = "luxury"


class Interest(StrEnum):
    FOOD = "food"
    HISTORY = "history"
    ART = "art"
    NATURE = "nature"
    NIGHTLIFE = "nightlife"
    SHOPPING = "shopping"
    RELAXATION = "relaxation"
    ADVENTURE = "adventure"


class Pace(StrEnum):
    RELAXED = "relaxed"
    BALANCED = "balanced"
    PACKED = "packed"


class Mobility(StrEnum):
    NONE = "none"
    LIMITED = "limited"
    WHEELCHAIR = "wheelchair"


class Dietary(StrEnum):
    VEGETARIAN = "vegetarian"
    VEGAN = "vegan"
    HALAL = "halal"
    KOSHER = "kosher"
    GLUTEN_FREE = "gluten_free"


class GeoPoint(ApiModel):
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)


class Destination(ApiModel):
    """A destination the user picked from geocoder results, so its coordinates are real."""

    name: ShortText
    display_name: Annotated[str, StringConstraints(max_length=300)]
    country: Annotated[str, StringConstraints(max_length=80)] | None = None
    country_code: Annotated[str, StringConstraints(pattern=r"^[a-z]{2}$")] | None = None
    location: GeoPoint
    radius_km: float | None = Field(
        default=None, ge=0, le=3000, description="Half the diagonal of its area, from the geocoder"
    )
    days: int = Field(ge=1, le=MAX_TRIP_DAYS)


class Travelers(ApiModel):
    party: Party
    adults: int = Field(ge=1, le=12)
    children: int = Field(default=0, ge=0, le=10)

    @model_validator(mode="after")
    def _party_fits(self) -> "Travelers":
        if self.party is Party.SOLO and (self.adults != 1 or self.children):
            raise ValueError("a solo trip has exactly one adult")
        if self.party is Party.COUPLE and (self.adults != 2 or self.children):
            raise ValueError("a couple is two adults")
        if self.party is Party.FAMILY and self.children < 1:
            raise ValueError("a family trip includes at least one child")
        return self

    @property
    def count(self) -> int:
        return self.adults + self.children


class Constraints(ApiModel):
    mobility: Mobility = Mobility.NONE
    dietary: list[Dietary] = Field(default_factory=list, max_length=5)
    must_see: list[ShortText] = Field(default_factory=list, max_length=10)
    notes: Annotated[str, StringConstraints(strip_whitespace=True, max_length=500)] = ""

    @field_validator("dietary")
    @classmethod
    def _unique_dietary(cls, value: list[Dietary]) -> list[Dietary]:
        if len(set(value)) != len(value):
            raise ValueError("dietary needs must be unique")
        return value


class TripRequest(ApiModel):
    destinations: list[Destination] = Field(min_length=1, max_length=MAX_DESTINATIONS)
    start_date: date | None = None
    travelers: Travelers
    budget_level: BudgetLevel
    budget_amount: Money | None = Field(default=None, description="Total for the whole trip")
    currency: Currency
    interests: list[Interest] = Field(min_length=1, max_length=len(Interest))
    pace: Pace
    constraints: Constraints = Field(default_factory=Constraints)

    @field_validator("interests")
    @classmethod
    def _unique_interests(cls, value: list[Interest]) -> list[Interest]:
        if len(set(value)) != len(value):
            raise ValueError("interests must be unique")
        return value

    @model_validator(mode="after")
    def _length_fits(self) -> "TripRequest":
        if self.total_days > MAX_TRIP_DAYS:
            raise ValueError(f"a trip can be at most {MAX_TRIP_DAYS} days")
        return self

    @property
    def total_days(self) -> int:
        return sum(destination.days for destination in self.destinations)

    def destination_for_day(self, day: int) -> int:
        """Index of the destination a 0-based trip day belongs to."""
        remaining = day
        for index, destination in enumerate(self.destinations):
            if remaining < destination.days:
                return index
            remaining -= destination.days
        raise ValueError(f"day {day} is outside the trip")
