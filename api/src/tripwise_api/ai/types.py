from dataclasses import dataclass, replace
from enum import StrEnum
from typing import Any, Protocol


class FailureKind(StrEnum):
    QUOTA = "quota"  # daily or project quota used up
    RATE_LIMIT = "rate_limit"  # too many requests right now
    TRANSIENT = "transient"  # timeout, network or 5xx
    REJECTED = "rejected"  # the provider refused this request (4xx)


class ProviderError(Exception):
    def __init__(self, provider: str, kind: FailureKind, detail: str) -> None:
        super().__init__(f"{provider}: {kind.value}: {detail}")
        self.provider = provider
        self.kind = kind


class AiUnavailableError(Exception):
    """No provider produced valid output. The caller shows a friendly retry-later message."""


@dataclass(frozen=True, slots=True)
class AiRequest:
    task: str  # names the prompt template, e.g. "placement_quiz"
    system: str
    prompt: str
    schema: dict[str, Any]
    temperature: float = 0.4

    def with_repair(self, previous_reply: str, problems: str) -> "AiRequest":
        note = (
            "\n\nYour previous reply could not be used:\n"
            f"{problems}\n\nPrevious reply:\n{previous_reply[:4000]}\n\n"
            "Reply again with JSON that matches the schema and fixes every problem."
        )
        return replace(self, prompt=self.prompt + note)


class LlmProvider(Protocol):
    name: str

    async def generate_json(self, request: AiRequest) -> str:
        """Return the model's raw JSON text. Raise ProviderError on any failure."""
        ...
