"""Firestore storage for the account: profile, plan tier, billing, AI usage, erasure."""

from typing import Any

from google.cloud.firestore import AsyncClient, AsyncDocumentReference, FieldFilter, Increment

from tripwise_api.domain.usage import check_allowance
from tripwise_api.repository.protocol import BillingRecord
from tripwise_api.schemas.profile import Preferences, Profile, Tier


def _used(snapshot: Any) -> int:
    return int((snapshot.to_dict() or {}).get("aiRequests", 0))


class FirestoreAccountStore:
    _db: AsyncClient

    def _user(self, uid: str) -> AsyncDocumentReference:
        return self._db.collection("users").document(uid)

    def _billing(self, uid: str) -> AsyncDocumentReference:
        return self._db.collection("billing").document(uid)

    async def get_profile(self, uid: str) -> Profile | None:
        snapshot = await self._user(uid).get()
        if not snapshot.exists:
            return None
        return Profile.model_validate({"uid": uid, **(snapshot.to_dict() or {})})

    async def save_preferences(self, uid: str, preferences: Preferences) -> None:
        await self._user(uid).update({"preferences": preferences.model_dump(mode="json")})

    async def set_tier(self, uid: str, tier: Tier, billing: BillingRecord | None) -> None:
        batch = self._db.batch()
        batch.update(self._user(uid), {"tier": tier.value})
        if billing is None:
            batch.delete(self._billing(uid))
        else:
            batch.set(self._billing(uid), billing.model_dump(mode="json"))
        await batch.commit()

    async def get_billing(self, uid: str) -> BillingRecord | None:
        snapshot = await self._billing(uid).get()
        return BillingRecord.model_validate(snapshot.to_dict() or {}) if snapshot.exists else None

    async def count_ai_request(
        self, uid: str, day: str, user_limit: int, global_limit: int
    ) -> None:
        # Soft limits: read, check, then atomic increments. A transaction would make every user
        # contend on the one global document; this way concurrent requests can overshoot a
        # daily limit by a request or two, but no count is ever lost.
        user_ref = self._user(uid).collection("usage").document(day)
        global_ref = self._db.collection("aiUsage").document(day)
        user_snapshot, global_snapshot = await user_ref.get(), await global_ref.get()
        check_allowance(_used(user_snapshot), _used(global_snapshot), user_limit, global_limit)
        await self._add_usage(uid, day, 1)

    async def refund_ai_request(self, uid: str, day: str) -> None:
        await self._add_usage(uid, day, -1)

    async def _add_usage(self, uid: str, day: str, amount: int) -> None:
        batch = self._db.batch()
        for reference in (
            self._user(uid).collection("usage").document(day),
            self._db.collection("aiUsage").document(day),
        ):
            batch.set(reference, {"aiRequests": Increment(amount)}, merge=True)
        await batch.commit()

    async def ai_requests_on(self, uid: str, day: str) -> int:
        return _used(await self._user(uid).collection("usage").document(day).get())

    async def delete_user_data(self, uid: str) -> None:
        shares = self._db.collection("shares").where(filter=FieldFilter("uid", "==", uid))
        async for snapshot in shares.stream():
            await snapshot.reference.delete()
        await self._db.recursive_delete(self._user(uid))
        await self._billing(uid).delete()
