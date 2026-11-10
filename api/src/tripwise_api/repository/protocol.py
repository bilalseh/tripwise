"""The storage boundary: routes depend on this protocol, never on Firestore directly."""

from collections.abc import Sequence
from dataclasses import dataclass, field
from typing import Protocol

from tripwise_api.schemas.base import ApiModel
from tripwise_api.schemas.essentials import DocumentChecklist, PackingList, PackingTemplate
from tripwise_api.schemas.profile import Preferences, Profile, Tier
from tripwise_api.schemas.trip import Trip


class VersionConflictError(Exception):
    """The trip changed since the client loaded it (another tab or device saved first)."""


class BillingRecord(ApiModel):
    customer_id: str
    subscription_id: str


@dataclass(frozen=True, slots=True)
class SeedTrip:
    trip: Trip
    packing: PackingList | None = None
    documents: DocumentChecklist | None = None
    templates: Sequence[PackingTemplate] = field(default_factory=tuple)


class Repository(Protocol):
    # Account -------------------------------------------------------------------------------
    async def ensure_profile(self, profile: Profile, seed: Sequence[SeedTrip] = ()) -> Profile:
        """Create the profile and its seed trips atomically if it does not exist yet. Returns
        the stored profile, which may be an older one."""
        ...

    async def get_profile(self, uid: str) -> Profile | None: ...

    async def save_preferences(self, uid: str, preferences: Preferences) -> None: ...

    async def set_tier(self, uid: str, tier: Tier, billing: BillingRecord | None) -> None: ...

    async def get_billing(self, uid: str) -> BillingRecord | None: ...

    async def count_ai_request(
        self, uid: str, day: str, user_limit: int, global_limit: int
    ) -> None:
        """Count one AI request, or raise UsageLimitError if a daily limit is already reached."""
        ...

    async def refund_ai_request(self, uid: str, day: str) -> None: ...

    async def ai_requests_on(self, uid: str, day: str) -> int: ...

    async def delete_user_data(self, uid: str) -> None:
        """Erase everything the user owns, including share links and billing records."""
        ...

    # Trips ---------------------------------------------------------------------------------
    async def list_trips(self, uid: str) -> list[Trip]: ...

    async def get_trip(self, uid: str, trip_id: str) -> Trip | None: ...

    async def create_trip(self, uid: str, trip: Trip) -> None: ...

    async def save_trip(self, uid: str, trip: Trip, expected_version: int) -> None:
        """Replace the trip if its stored version is `expected_version`, else raise
        VersionConflictError. `trip.version` is the new version."""
        ...

    async def delete_trip(self, uid: str, trip_id: str) -> None:
        """Delete the trip, its packing list, documents and share link."""
        ...

    # Essentials ----------------------------------------------------------------------------
    async def get_packing(self, uid: str, trip_id: str) -> PackingList | None: ...

    async def save_packing(self, uid: str, trip_id: str, packing: PackingList) -> None: ...

    async def get_documents(self, uid: str, trip_id: str) -> DocumentChecklist | None: ...

    async def save_documents(
        self, uid: str, trip_id: str, documents: DocumentChecklist
    ) -> None: ...

    async def list_templates(self, uid: str) -> list[PackingTemplate]: ...

    async def save_template(self, uid: str, template: PackingTemplate) -> None: ...

    async def delete_template(self, uid: str, template_id: str) -> None: ...

    # Sharing -------------------------------------------------------------------------------
    async def set_share(self, uid: str, trip_id: str, token: str | None) -> None:
        """Point the trip at a new share token (revoking any old one), or revoke with None."""
        ...

    async def resolve_share(self, token: str) -> tuple[str, str] | None:
        """(uid, trip_id) behind a live share token."""
        ...
