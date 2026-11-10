"""Spacing and concurrency limits for calls to free public APIs."""

import asyncio
import time
from collections.abc import AsyncIterator, Awaitable, Callable
from contextlib import asynccontextmanager


class Throttle:
    """At most one call per `interval` seconds and `concurrency` calls in flight, per process.

    Nominatim's policy is one request per second for the whole application. Cloud Run runs at
    most two instances, so its interval is set to two seconds (see config.py).
    """

    def __init__(
        self,
        interval: float,
        concurrency: int = 1,
        clock: Callable[[], float] = time.monotonic,
        sleep: Callable[[float], Awaitable[None]] = asyncio.sleep,
    ) -> None:
        self._interval = interval
        self._semaphore = asyncio.Semaphore(concurrency)
        self._lock = asyncio.Lock()
        self._next = 0.0
        self._clock = clock
        self._sleep = sleep

    @asynccontextmanager
    async def slot(self) -> AsyncIterator[None]:
        async with self._semaphore:
            async with self._lock:
                wait = self._next - self._clock()
                if wait > 0:
                    await self._sleep(wait)
                self._next = max(self._clock(), self._next) + self._interval
            yield
