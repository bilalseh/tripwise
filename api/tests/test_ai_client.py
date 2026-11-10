import json

import pytest
from pydantic import Field

from tests.fakes import ScriptedProvider
from tripwise_api.ai.client import AiClient
from tripwise_api.ai.types import AiUnavailableError, FailureKind, ProviderError
from tripwise_api.schemas.base import ApiModel

pytestmark = pytest.mark.anyio


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"


class Greeting(ApiModel):
    text: str = Field(min_length=3)
    stars: int = Field(ge=1, le=5)


VALID = json.dumps({"text": "Hello", "stars": 4})
INVALID = json.dumps({"text": "Hi", "stars": 9})


async def generate(client: AiClient) -> Greeting:
    result = await client.generate("greeting", Greeting, "system", "prompt")
    assert result.value is not None
    return result.value


async def test_returns_validated_output() -> None:
    client = AiClient([ScriptedProvider("a", [VALID])])

    result = await client.generate("greeting", Greeting, "system", "prompt")

    assert result.value == Greeting(text="Hello", stars=4)
    assert result.provider == "a"


async def test_repairs_invalid_output_with_the_validation_errors() -> None:
    provider = ScriptedProvider("a", [INVALID, VALID])

    assert await generate(AiClient([provider])) == Greeting(text="Hello", stars=4)
    repair_prompt = provider.requests[1].prompt
    assert "text: String should have at least 3 characters" in repair_prompt
    assert "stars: Input should be less than or equal to 5" in repair_prompt


async def test_repairs_replies_that_are_not_json() -> None:
    provider = ScriptedProvider("a", ["Sure! Here you go:", VALID])

    assert (await generate(AiClient([provider]))).stars == 4


async def test_moves_to_the_next_provider_when_repair_fails() -> None:
    first = ScriptedProvider("a", [INVALID, INVALID])
    second = ScriptedProvider("b", [VALID])

    result = await AiClient([first, second]).generate("greeting", Greeting, "s", "p")

    assert result.provider == "b"


async def test_falls_back_when_the_first_provider_is_out_of_quota() -> None:
    quota = ProviderError("a", FailureKind.QUOTA, "HTTP 429")
    first = ScriptedProvider("a", [quota, VALID])
    second = ScriptedProvider("b", [VALID, VALID])
    client = AiClient([first, second], clock=lambda: 1000.0)

    assert (await client.generate("greeting", Greeting, "s", "p")).provider == "b"
    # While cooling down, the exhausted provider is not even asked.
    assert (await client.generate("greeting", Greeting, "s", "p")).provider == "b"
    assert len(first.requests) == 1


async def test_retries_a_provider_after_its_cool_down() -> None:
    now = [1000.0]
    first = ScriptedProvider("a", [ProviderError("a", FailureKind.TRANSIENT, "timeout"), VALID])
    client = AiClient([first, ScriptedProvider("b", [VALID])], clock=lambda: now[0])
    await client.generate("greeting", Greeting, "s", "p")

    now[0] += 31

    assert (await client.generate("greeting", Greeting, "s", "p")).provider == "a"


async def test_never_returns_invalid_output() -> None:
    client = AiClient([ScriptedProvider("a", [INVALID, INVALID]), ScriptedProvider("b", [INVALID])])

    with pytest.raises(AiUnavailableError):
        await client.generate("greeting", Greeting, "s", "p")


async def test_without_providers_the_ai_is_unavailable() -> None:
    with pytest.raises(AiUnavailableError):
        await AiClient([]).generate("greeting", Greeting, "s", "p")


async def test_sends_a_self_contained_schema() -> None:
    provider = ScriptedProvider("a", [VALID])
    await generate(AiClient([provider]))

    schema = provider.requests[0].schema
    assert schema["properties"]["stars"] == {"maximum": 5, "minimum": 1, "type": "integer"}
    assert "$defs" not in json.dumps(schema)
