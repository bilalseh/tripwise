"""Per-user request limits (sliding window, in process).

Cloud Run runs at most two instances, so a user can get at most twice the limit; that is fine
for abuse protection. The AI's daily limits are separate and stored in Firestore.
"""

import time
from collections import defaultdict, deque
from collections.abc import Callable


class RateLimiter:
    def __init__(self, clock: Callable[[], float] = time.monotonic, window: float = 60.0) -> None:
        self._clock = clock
        self._window = window
        self._hits: defaultdict[tuple[str, str], deque[float]] = defaultdict(deque)

    def allow(self, bucket: str, key: str, limit: int) -> bool:
        now = self._clock()
        hits = self._hits[(bucket, key)]
        while hits and hits[0] <= now - self._window:
            hits.popleft()
        if len(hits) >= limit:
            return False
        hits.append(now)
        return True

    def retry_after(self, bucket: str, key: str) -> int:
        hits = self._hits.get((bucket, key))
        if not hits:
            return 0
        return max(1, int(hits[0] + self._window - self._clock()) + 1)
