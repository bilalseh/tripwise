"""AI edit actions on one day. The API proposes; the browser shows a diff and the user decides."""

from enum import StrEnum

from pydantic import Field

from tripwise_api.schemas.base import ApiModel
from tripwise_api.schemas.trip import Day, GroundingReport
from tripwise_api.schemas.trip_request import MAX_TRIP_DAYS


class EditAction(StrEnum):
    RELAXED = "relaxed"
    RAINY = "rainy"
    LOCAL_FOOD = "local_food"
    CHEAPER = "cheaper"


class AiEditRequest(ApiModel):
    action: EditAction
    day_index: int = Field(ge=0, lt=MAX_TRIP_DAYS)
    # The day as the user currently sees it, which may include edits not saved yet.
    day: Day


class AiEditProposal(ApiModel):
    action: EditAction
    day_index: int
    day: Day
    summary: str
    report: GroundingReport
