"""Firestore implementation of the storage boundary.

users/{uid}                          profile
users/{uid}/trips/{tripId}           trip with its days and stops (one document)
users/{uid}/trips/{tripId}/extras/*  packing list, documents checklist
users/{uid}/templates/{id}           packing templates
users/{uid}/usage/{day}              AI requests per UTC day
shares/{token}                       {uid, tripId}; server-only, deleted to revoke
billing/{uid}, aiUsage/{day}, cache/* server-only
"""

from collections.abc import Sequence
from typing import Any

from google.api_core.exceptions import AlreadyExists
from google.cloud.firestore import (
    AsyncClient,
    AsyncDocumentReference,
    AsyncTransaction,
    async_transactional,
)

from tripwise_api.repository.firestore_account import FirestoreAccountStore
from tripwise_api.repository.protocol import SeedTrip, VersionConflictError
from tripwise_api.schemas.essentials import DocumentChecklist, PackingList, PackingTemplate
from tripwise_api.schemas.profile import Profile
from tripwise_api.schemas.trip import Trip


def _trip_data(trip: Trip) -> dict[str, Any]:
    return trip.model_dump(mode="json", exclude={"id"})


@async_transactional
async def _replace_if_version(
    transaction: AsyncTransaction, ref: AsyncDocumentReference, data: dict[str, Any], expected: int
) -> None:
    snapshot = await ref.get(transaction=transaction)
    if not snapshot.exists or (snapshot.to_dict() or {}).get("version") != expected:
        raise VersionConflictError
    transaction.set(ref, data)


class FirestoreRepository(FirestoreAccountStore):
    def __init__(self, client: AsyncClient) -> None:
        self._db = client

    def _trip(self, uid: str, trip_id: str) -> AsyncDocumentReference:
        ref: AsyncDocumentReference = self._user(uid).collection("trips").document(trip_id)
        return ref

    def _extra(self, uid: str, trip_id: str, name: str) -> AsyncDocumentReference:
        ref: AsyncDocumentReference = self._trip(uid, trip_id).collection("extras").document(name)
        return ref

    async def ensure_profile(self, profile: Profile, seed: Sequence[SeedTrip] = ()) -> Profile:
        user_ref = self._user(profile.uid)
        snapshot = await user_ref.get()
        if snapshot.exists:
            return Profile.model_validate({"uid": profile.uid, **(snapshot.to_dict() or {})})
        batch = self._db.batch()
        batch.create(user_ref, profile.model_dump(mode="json", exclude={"uid"}))
        for item in seed:
            batch.create(self._trip(profile.uid, item.trip.id), _trip_data(item.trip))
            if item.packing:
                batch.create(
                    self._extra(profile.uid, item.trip.id, "packing"),
                    item.packing.model_dump(mode="json"),
                )
            if item.documents:
                batch.create(
                    self._extra(profile.uid, item.trip.id, "documents"),
                    item.documents.model_dump(mode="json"),
                )
            for template in item.templates:
                ref = user_ref.collection("templates").document(template.id)
                batch.create(ref, template.model_dump(mode="json", exclude={"id"}))
        try:
            await batch.commit()
        except AlreadyExists:
            # A concurrent first sign-in won the race and seeded the account; use its profile.
            stored = await self.get_profile(profile.uid)
            if stored is None:
                raise
            return stored
        return profile

    async def list_trips(self, uid: str) -> list[Trip]:
        trips = self._user(uid).collection("trips")
        return [
            Trip.model_validate({"id": s.id, **(s.to_dict() or {})}) async for s in trips.stream()
        ]

    async def get_trip(self, uid: str, trip_id: str) -> Trip | None:
        snapshot = await self._trip(uid, trip_id).get()
        if not snapshot.exists:
            return None
        return Trip.model_validate({"id": trip_id, **(snapshot.to_dict() or {})})

    async def create_trip(self, uid: str, trip: Trip) -> None:
        await self._trip(uid, trip.id).create(_trip_data(trip))

    async def save_trip(self, uid: str, trip: Trip, expected_version: int) -> None:
        await _replace_if_version(
            self._db.transaction(), self._trip(uid, trip.id), _trip_data(trip), expected_version
        )

    async def delete_trip(self, uid: str, trip_id: str) -> None:
        trip = await self.get_trip(uid, trip_id)
        if trip and trip.share_token:
            await self._db.collection("shares").document(trip.share_token).delete()
        await self._db.recursive_delete(self._trip(uid, trip_id))

    async def get_packing(self, uid: str, trip_id: str) -> PackingList | None:
        snapshot = await self._extra(uid, trip_id, "packing").get()
        return PackingList.model_validate(snapshot.to_dict() or {}) if snapshot.exists else None

    async def save_packing(self, uid: str, trip_id: str, packing: PackingList) -> None:
        await self._extra(uid, trip_id, "packing").set(packing.model_dump(mode="json"))

    async def get_documents(self, uid: str, trip_id: str) -> DocumentChecklist | None:
        snapshot = await self._extra(uid, trip_id, "documents").get()
        return (
            DocumentChecklist.model_validate(snapshot.to_dict() or {}) if snapshot.exists else None
        )

    async def save_documents(self, uid: str, trip_id: str, documents: DocumentChecklist) -> None:
        await self._extra(uid, trip_id, "documents").set(documents.model_dump(mode="json"))

    async def list_templates(self, uid: str) -> list[PackingTemplate]:
        templates = self._user(uid).collection("templates")
        return [
            PackingTemplate.model_validate({"id": s.id, **(s.to_dict() or {})})
            async for s in templates.stream()
        ]

    async def save_template(self, uid: str, template: PackingTemplate) -> None:
        ref = self._user(uid).collection("templates").document(template.id)
        await ref.set(template.model_dump(mode="json", exclude={"id"}))

    async def delete_template(self, uid: str, template_id: str) -> None:
        await self._user(uid).collection("templates").document(template_id).delete()

    async def set_share(self, uid: str, trip_id: str, token: str | None) -> None:
        trip = await self.get_trip(uid, trip_id)
        if trip is None:
            return
        batch = self._db.batch()
        if trip.share_token:
            batch.delete(self._db.collection("shares").document(trip.share_token))
        if token:
            batch.create(
                self._db.collection("shares").document(token), {"uid": uid, "tripId": trip_id}
            )
        batch.update(self._trip(uid, trip_id), {"shareToken": token})
        await batch.commit()

    async def resolve_share(self, token: str) -> tuple[str, str] | None:
        snapshot = await self._db.collection("shares").document(token).get()
        data = snapshot.to_dict() or {}
        uid, trip_id = data.get("uid"), data.get("tripId")
        if isinstance(uid, str) and isinstance(trip_id, str):
            return uid, trip_id
        return None
