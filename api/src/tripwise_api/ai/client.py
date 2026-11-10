"""Routes a request through the providers in order and returns only validated output."""

import logging
import time
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from typing import TypeVar

from pydantic import BaseModel, ValidationError

from tripwise_api.ai.types import (
    AiRequest,
    AiUnavailableError,
    FailureKind,
    LlmProvider,
    ProviderError,
)
from tripwise_api.schemas.json_schema import provider_schema

logger = logging.getLogger(__name__)

T = TypeVar("T", bound=BaseModel)

# How long to skip a provider after a failure, so users do not wait on a known-bad provider.
COOL_DOWN_SECONDS: dict[FailureKind, float] = {
    FailureKind.QUOTA: 3600,
    FailureKind.RATE_LIMIT: 60,
    FailureKind.TRANSIENT: 30,
    FailureKind.REJECTED: 0,
}
REPAIR_ATTEMPTS = 1


@dataclass(frozen=True, slots=True)
class AiResult[T]:
    value: T
    provider: str


def describe_problems(error: ValidationError, limit: int = 10) -> str:
    lines = []
    for problem in error.errors(include_url=False)[:limit]:
        location = ".".join(str(part) for part in problem["loc"]) or "(root)"
        lines.append(f"- {location}: {problem['msg']}")
    return "\n".join(lines)


class AiClient:
    def __init__(
        self, providers: Sequence[LlmProvider], clock: Callable[[], float] = time.monotonic
    ) -> None:
        self._providers = list(providers)
        self._clock = clock
        self._skip_until: dict[str, float] = {}

    @property
    def provider_names(self) -> list[str]:
        return [provider.name for provider in self._providers]

    def _available(self) -> list[LlmProvider]:
        now = self._clock()
        return [p for p in self._providers if self._skip_until.get(p.name, 0) <= now]

    def _cool_down(self, error: ProviderError) -> None:
        seconds = COOL_DOWN_SECONDS[error.kind]
        if seconds:
            self._skip_until[error.provider] = self._clock() + seconds

    async def generate(
        self,
        task: str,
        model: type[T],
        system: str,
        prompt: str,
        temperature: float = 0.4,
        check: Callable[[T], list[str]] | None = None,
    ) -> AiResult[T]:
        """Ask each available provider in turn. Invalid replies get one repair attempt with the
        validation errors; output that still fails validation is never returned.

        `check` adds rules the schema cannot express (they depend on the learner); its problems
        are treated like validation errors.
        """
        base = AiRequest(task, system, prompt, provider_schema(model), temperature)
        for provider in self._available():
            request = base
            for attempt in range(REPAIR_ATTEMPTS + 1):
                started = self._clock()
                try:
                    raw = await provider.generate_json(request)
                except ProviderError as error:
                    logger.warning("ai %s failed: %s", task, error)
                    self._cool_down(error)
                    break
                try:
                    value = model.model_validate_json(raw)
                except ValidationError as error:
                    invalid = describe_problems(error)
                    # Field paths and messages only (no input values), to diagnose providers.
                    logger.warning(
                        "ai %s from %s invalid (attempt %d): %d problem(s): %s",
                        task,
                        provider.name,
                        attempt + 1,
                        error.error_count(),
                        invalid,
                    )
                    request = base.with_repair(raw, invalid)
                    continue
                problems = check(value) if check else []
                if problems:
                    logger.warning(
                        "ai %s from %s did not fit (attempt %d): %d problem(s)",
                        task,
                        provider.name,
                        attempt + 1,
                        len(problems),
                    )
                    request = base.with_repair(raw, "\n".join(f"- {p}" for p in problems))
                    continue
                logger.info(
                    "ai %s served by %s in %.1fs", task, provider.name, self._clock() - started
                )
                return AiResult(value, provider.name)
        raise AiUnavailableError(task)
