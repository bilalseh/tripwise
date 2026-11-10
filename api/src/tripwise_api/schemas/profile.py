from datetime import datetime
from enum import StrEnum

from pydantic import Field

from tripwise_api.schemas.base import ApiModel, Currency


class Tier(StrEnum):
    FREE = "free"
    PRO = "pro"


class Language(StrEnum):
    EN = "en"
    AR = "ar"


class Units(StrEnum):
    METRIC = "metric"
    IMPERIAL = "imperial"


class Preferences(ApiModel):
    """Settings the user chooses. Language also sets the language the AI writes in."""

    language: Language = Language.EN
    home_currency: Currency = "USD"
    units: Units = Units.METRIC


class Profile(ApiModel):
    """The signed-in user's profile, stored at users/{uid}."""

    uid: str
    display_name: str | None
    email: str | None
    is_demo: bool
    created_at: datetime
    tier: Tier = Tier.FREE
    preferences: Preferences = Field(default_factory=Preferences)


class Usage(ApiModel):
    """Today's AI requests and the trips allowed on the user's plan."""

    ai_used: int
    ai_limit: int
    resets_at: datetime
    tier: Tier
    trips: int
    trip_limit: int | None = Field(description="Trips allowed on this plan; null is unlimited")
