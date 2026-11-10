"""Billing and sharing payloads."""

from datetime import date

from pydantic import Field

from tripwise_api.schemas.base import ApiModel
from tripwise_api.schemas.profile import Tier
from tripwise_api.schemas.trip import Day
from tripwise_api.schemas.trip_request import Destination, Travelers


class BillingStatus(ApiModel):
    available: bool = Field(description="False when test-mode Stripe keys are not configured")
    tier: Tier
    price_cents: int


class CheckoutSession(ApiModel):
    url: str


class ConfirmCheckoutRequest(ApiModel):
    session_id: str = Field(pattern=r"^cs_test_[A-Za-z0-9]{1,200}$")


class ShareLink(ApiModel):
    token: str
    path: str


class SharedTrip(ApiModel):
    """The read-only view behind a share link: the map and the itinerary, nothing private
    (no notes, budget overrides, packing list or documents)."""

    title: str
    destinations: list[Destination]
    start_date: date | None
    travelers: Travelers
    currency: str
    days: list[Day]
