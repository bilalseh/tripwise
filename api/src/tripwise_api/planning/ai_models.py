"""What the AI is allowed to return. No coordinates, addresses or opening hours: places are
names to look up, and every number is an estimate."""

from typing import Annotated

from pydantic import ConfigDict, Field, StringConstraints

from tripwise_api.schemas.base import ApiModel, ShortText
from tripwise_api.schemas.trip import Slot, StopCategory


class AiModel(ApiModel):
    """AI output models: the plain validation schema is what the providers are sent."""

    model_config = ConfigDict(
        json_schema_mode_override=None, json_schema_serialization_defaults_required=False
    )


Sentence = Annotated[str, StringConstraints(strip_whitespace=True, max_length=300)]
Estimate = Annotated[float, Field(ge=0, le=100_000)]


class AiStop(AiModel):
    name: ShortText = Field(description="The place's real, searchable name")
    area: Annotated[str, StringConstraints(strip_whitespace=True, max_length=120)] = Field(
        default="", description="Neighbourhood or town, to help find the place"
    )
    category: StopCategory
    slot: Slot
    reason: Sentence = Field(description="Why it fits this traveller, one sentence")
    duration_minutes: int = Field(ge=15, le=480)
    cost_estimate: Estimate = Field(description="Whole party, trip currency; 0 if free")
    keep_id: Annotated[str, StringConstraints(max_length=64)] | None = Field(
        default=None, description="Edits only: id of the existing stop this keeps"
    )


class AiDay(AiModel):
    title: Annotated[str, StringConstraints(strip_whitespace=True, max_length=120)]
    stops: list[AiStop] = Field(min_length=1, max_length=10)
    rain_plan: list[AiStop] = Field(default_factory=list, max_length=5)
    stay_estimate: Estimate = Field(description="One night's stay for the party")
    food_estimate: Estimate = Field(description="Meals not covered by food stops")
    transport_estimate: Estimate = Field(description="Local transport for the day")


class AiItinerary(AiModel):
    days: list[AiDay] = Field(min_length=1, max_length=4)


class AiDayEdit(AiModel):
    summary: Sentence = Field(description="What changed, for the user, one or two sentences")
    day: AiDay
