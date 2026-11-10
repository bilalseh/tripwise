"""Response caches for geocoding, routing and weather.

Two levels: an in-process LRU (fast, per instance) in front of Firestore (shared by instances,
survives restarts). Firestore documents carry `expireAt`, which a TTL policy cleans up.
"""

import hashlib
import json
import time
from collections import OrderedDict
from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from typing import Any, Protocol

from google.cloud.firestore import AsyncClient


def cache_key(*parts: object) -> str:
    raw = json.dumps(parts, sort_keys=True, ensure_ascii=False, default=str)
    return hashlib.sha256(raw.encode()).hexdigest()


class Cache(Protocol):
    async def get(self, namespace: str, key: str) -> Any | None: ...

    async def set(self, namespace: str, key: str, value: Any, ttl: timedelta) -> None: ...


class MemoryCache:
    def __init__(
        self, max_entries: int = 2000, clock: Callable[[], float] = time.monotonic
    ) -> None:
        self._entries: OrderedDict[tuple[str, str], tuple[float, Any]] = OrderedDict()
        self._max = max_entries
        self._clock = clock

    async def get(self, namespace: str, key: str) -> Any | None:
        entry = self._entries.get((namespace, key))
        if entry is None:
            return None
        expires, value = entry
        if expires < self._clock():
            del self._entries[(namespace, key)]
            return None
        self._entries.move_to_end((namespace, key))
        return value

    async def set(self, namespace: str, key: str, value: Any, ttl: timedelta) -> None:
        self._entries[(namespace, key)] = (self._clock() + ttl.total_seconds(), value)
        self._entries.move_to_end((namespace, key))
        while len(self._entries) > self._max:
            self._entries.popitem(last=False)


class FirestoreCache:
    """Documents at cache/{namespace}__{key}; never readable by clients (rules deny all)."""

    def __init__(self, client: AsyncClient) -> None:
        self._db = client

    async def get(self, namespace: str, key: str) -> Any | None:
        snapshot = await self._db.collection("cache").document(f"{namespace}__{key}").get()
        if not snapshot.exists:
            return None
        data = snapshot.to_dict() or {}
        expire_at = data.get("expireAt")
        if isinstance(expire_at, datetime) and expire_at < datetime.now(UTC):
            return None
        return json.loads(data.get("value", "null"))

    async def set(self, namespace: str, key: str, value: Any, ttl: timedelta) -> None:
        await (
            self._db.collection("cache")
            .document(f"{namespace}__{key}")
            .set(
                {
                    "value": json.dumps(value, ensure_ascii=False),
                    "expireAt": datetime.now(UTC) + ttl,
                }
            )
        )


class LayeredCache:
    def __init__(self, *layers: Cache) -> None:
        self._layers = layers

    async def get(self, namespace: str, key: str) -> Any | None:
        for index, layer in enumerate(self._layers):
            value = await layer.get(namespace, key)
            if value is not None:
                for upper in self._layers[:index]:
                    await upper.set(namespace, key, value, timedelta(hours=6))
                return value
        return None

    async def set(self, namespace: str, key: str, value: Any, ttl: timedelta) -> None:
        for layer in self._layers:
            await layer.set(namespace, key, value, ttl)
