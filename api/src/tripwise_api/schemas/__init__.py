"""Public API models. Each one is exported to /shared as TypeScript (and Zod for requests)."""

from pydantic import BaseModel

from tripwise_api.schemas.account import (
    BillingStatus,
    CheckoutSession,
    ConfirmCheckoutRequest,
    SharedTrip,
    ShareLink,
)
from tripwise_api.schemas.edits import AiEditProposal, AiEditRequest
from tripwise_api.schemas.essentials import (
    DocumentChecklist,
    DocumentsResponse,
    PackingList,
    PackingTemplate,
    SaveTemplateRequest,
    WeatherReport,
)
from tripwise_api.schemas.health import HealthResponse
from tripwise_api.schemas.places import PlaceSearchResponse, TravelRequest, TravelResponse
from tripwise_api.schemas.profile import Preferences, Profile, Usage
from tripwise_api.schemas.trip import (
    CreateTripRequest,
    DuplicateTripRequest,
    GenerateRequest,
    SaveTripRequest,
    Trip,
    TripSummary,
)
from tripwise_api.schemas.trip_request import TripRequest

# Requests also get Zod schemas on the web side, for form validation.
REQUEST_MODELS: tuple[type[BaseModel], ...] = (
    TripRequest,
    CreateTripRequest,
    SaveTripRequest,
    GenerateRequest,
    DuplicateTripRequest,
    AiEditRequest,
    TravelRequest,
    Preferences,
    PackingList,
    DocumentChecklist,
    SaveTemplateRequest,
    ConfirmCheckoutRequest,
)
RESPONSE_MODELS: tuple[type[BaseModel], ...] = (
    HealthResponse,
    Profile,
    Usage,
    Trip,
    TripSummary,
    AiEditProposal,
    PlaceSearchResponse,
    TravelResponse,
    PackingTemplate,
    DocumentsResponse,
    WeatherReport,
    ShareLink,
    SharedTrip,
    BillingStatus,
    CheckoutSession,
)

__all__ = ["REQUEST_MODELS", "RESPONSE_MODELS", "HealthResponse"]
