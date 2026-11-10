"""In-memory stand-ins for Firebase Auth, Firestore, the AI providers and Stripe."""

import itertools
from collections.abc import Sequence
from datetime import timedelta
from typing import Any

from tripwise_api.ai.types import AiRequest, FailureKind, ProviderError
from tripwise_api.auth import AuthenticatedUser, InvalidTokenError
from tripwise_api.billing.stripe import BillingError, CompletedCheckout
from tripwise_api.domain.usage import check_allowance
from tripwise_api.repository import BillingRecord, SeedTrip, VersionConflictError
from tripwise_api.schemas.essentials import DocumentChecklist, PackingList, PackingTemplate
from tripwise_api.schemas.profile import Preferences, Profile, Tier
from tripwise_api.schemas.trip import Trip


class FakeTokenVerifier:
    """Maps fixed token strings to users; anything else is rejected like a bad Firebase token."""

    def __init__(self, users: dict[str, AuthenticatedUser]) -> None:
        self._users = users

    def verify(self, id_token: str) -> AuthenticatedUser:
        try:
            return self._users[id_token]
        except KeyError as exc:
            raise InvalidTokenError from exc


class InMemoryRepository:
    def __init__(self) -> None:
        self.profiles: dict[str, Profile] = {}
        self.trips: dict[str, dict[str, Trip]] = {}
        self.packing: dict[tuple[str, str], PackingList] = {}
        self.documents: dict[tuple[str, str], DocumentChecklist] = {}
        self.templates: dict[str, dict[str, PackingTemplate]] = {}
        self.billing: dict[str, BillingRecord] = {}
        self.usage: dict[tuple[str, str], int] = {}
        self.shares: dict[str, tuple[str, str]] = {}

    async def ensure_profile(self, profile: Profile, seed: Sequence[SeedTrip] = ()) -> Profile:
        if profile.uid in self.profiles:
            return self.profiles[profile.uid]
        self.profiles[profile.uid] = profile
        for item in seed:
            self.trips.setdefault(profile.uid, {})[item.trip.id] = item.trip
            if item.packing:
                self.packing[(profile.uid, item.trip.id)] = item.packing
            if item.documents:
                self.documents[(profile.uid, item.trip.id)] = item.documents
            for template in item.templates:
                self.templates.setdefault(profile.uid, {})[template.id] = template
        return profile

    async def get_profile(self, uid: str) -> Profile | None:
        return self.profiles.get(uid)

    async def save_preferences(self, uid: str, preferences: Preferences) -> None:
        self.profiles[uid] = self.profiles[uid].model_copy(update={"preferences": preferences})

    async def set_tier(self, uid: str, tier: Tier, billing: BillingRecord | None) -> None:
        self.profiles[uid] = self.profiles[uid].model_copy(update={"tier": tier})
        if billing is None:
            self.billing.pop(uid, None)
        else:
            self.billing[uid] = billing

    async def get_billing(self, uid: str) -> BillingRecord | None:
        return self.billing.get(uid)

    async def count_ai_request(
        self, uid: str, day: str, user_limit: int, global_limit: int
    ) -> None:
        used_globally = sum(n for (_, d), n in self.usage.items() if d == day)
        check_allowance(self.usage.get((uid, day), 0), used_globally, user_limit, global_limit)
        self.usage[(uid, day)] = self.usage.get((uid, day), 0) + 1

    async def refund_ai_request(self, uid: str, day: str) -> None:
        self.usage[(uid, day)] -= 1

    async def ai_requests_on(self, uid: str, day: str) -> int:
        return self.usage.get((uid, day), 0)

    async def delete_user_data(self, uid: str) -> None:
        self.profiles.pop(uid, None)
        self.trips.pop(uid, None)
        self.templates.pop(uid, None)
        self.billing.pop(uid, None)
        for store in (self.packing, self.documents):
            for key in [k for k in store if k[0] == uid]:
                del store[key]
        self.shares = {t: owner for t, owner in self.shares.items() if owner[0] != uid}

    async def list_trips(self, uid: str) -> list[Trip]:
        return list(self.trips.get(uid, {}).values())

    async def get_trip(self, uid: str, trip_id: str) -> Trip | None:
        return self.trips.get(uid, {}).get(trip_id)

    async def create_trip(self, uid: str, trip: Trip) -> None:
        self.trips.setdefault(uid, {})[trip.id] = trip

    async def save_trip(self, uid: str, trip: Trip, expected_version: int) -> None:
        stored = self.trips.get(uid, {}).get(trip.id)
        if stored is None or stored.version != expected_version:
            raise VersionConflictError
        self.trips[uid][trip.id] = trip

    async def delete_trip(self, uid: str, trip_id: str) -> None:
        trip = self.trips.get(uid, {}).pop(trip_id, None)
        if trip and trip.share_token:
            self.shares.pop(trip.share_token, None)
        self.packing.pop((uid, trip_id), None)
        self.documents.pop((uid, trip_id), None)

    async def get_packing(self, uid: str, trip_id: str) -> PackingList | None:
        return self.packing.get((uid, trip_id))

    async def save_packing(self, uid: str, trip_id: str, packing: PackingList) -> None:
        self.packing[(uid, trip_id)] = packing

    async def get_documents(self, uid: str, trip_id: str) -> DocumentChecklist | None:
        return self.documents.get((uid, trip_id))

    async def save_documents(self, uid: str, trip_id: str, documents: DocumentChecklist) -> None:
        self.documents[(uid, trip_id)] = documents

    async def list_templates(self, uid: str) -> list[PackingTemplate]:
        return list(self.templates.get(uid, {}).values())

    async def save_template(self, uid: str, template: PackingTemplate) -> None:
        self.templates.setdefault(uid, {})[template.id] = template

    async def delete_template(self, uid: str, template_id: str) -> None:
        self.templates.get(uid, {}).pop(template_id, None)

    async def set_share(self, uid: str, trip_id: str, token: str | None) -> None:
        trip = self.trips[uid][trip_id]
        if trip.share_token:
            self.shares.pop(trip.share_token, None)
        if token:
            self.shares[token] = (uid, trip_id)
        self.trips[uid][trip_id] = trip.model_copy(update={"share_token": token})

    async def resolve_share(self, token: str) -> tuple[str, str] | None:
        return self.shares.get(token)


class MemoryOnlyCache:
    def __init__(self) -> None:
        self.values: dict[tuple[str, str], Any] = {}

    async def get(self, namespace: str, key: str) -> Any | None:
        return self.values.get((namespace, key))

    async def set(self, namespace: str, key: str, value: Any, ttl: timedelta) -> None:
        self.values[(namespace, key)] = value


class ScriptedProvider:
    """Replies with the given strings in order; a ProviderError in the list is raised."""

    def __init__(self, name: str, replies: Sequence[str | ProviderError]) -> None:
        self.name = name
        self._replies = list(replies)
        self.requests: list[AiRequest] = []

    async def generate_json(self, request: AiRequest) -> str:
        self.requests.append(request)
        if not self._replies:
            raise ProviderError(self.name, FailureKind.TRANSIENT, "script exhausted")
        reply = self._replies.pop(0)
        if isinstance(reply, ProviderError):
            raise reply
        return reply


class FakeBilling:
    """Stripe stand-in: checkouts complete when a test marks them paid."""

    def __init__(self) -> None:
        self.checkouts: list[tuple[str, str | None, str, str]] = []
        self.paid: dict[str, CompletedCheckout] = {}
        self.cancelled: list[str] = []
        self.fail = False

    async def create_checkout(
        self, uid: str, email: str | None, success_url: str, cancel_url: str
    ) -> str:
        if self.fail:
            raise BillingError("down")
        self.checkouts.append((uid, email, success_url, cancel_url))
        return f"https://checkout.stripe.com/c/pay/cs_test_{uid}"

    async def completed_checkout(self, session_id: str) -> CompletedCheckout | None:
        if self.fail:
            raise BillingError("down")
        return self.paid.get(session_id)

    async def cancel_subscription(self, subscription_id: str) -> None:
        if self.fail:
            raise BillingError("down")
        self.cancelled.append(subscription_id)


def counter_ids(prefix: str = "id") -> Any:
    counter = itertools.count(1)
    return lambda: f"{prefix}{next(counter)}"
