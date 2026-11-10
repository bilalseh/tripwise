import json
from collections.abc import Callable

import httpx
import pytest

from tripwise_api.ai.http_providers import GeminiProvider, GroqProvider
from tripwise_api.ai.types import AiRequest, FailureKind, ProviderError

pytestmark = pytest.mark.anyio

REQUEST = AiRequest("placement_quiz", "system text", "user text", {"type": "object"}, 0.2)


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"


def client_returning(handler: Callable[[httpx.Request], httpx.Response]) -> httpx.AsyncClient:
    return httpx.AsyncClient(transport=httpx.MockTransport(handler))


async def test_gemini_sends_the_schema_and_returns_the_text() -> None:
    seen: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        reply = {"candidates": [{"content": {"parts": [{"text": '{"ok": true}'}]}}]}
        return httpx.Response(200, json=reply)

    async with client_returning(handler) as http:
        text = await GeminiProvider(http, "secret-key", "gemini-test").generate_json(REQUEST)

    assert text == '{"ok": true}'
    [request] = seen
    assert request.url.path == "/v1beta/models/gemini-test:generateContent"
    assert request.headers["x-goog-api-key"] == "secret-key"
    body = json.loads(request.content)
    assert body["generationConfig"]["responseJsonSchema"] == {"type": "object"}
    assert body["systemInstruction"]["parts"][0]["text"] == "system text"


async def test_groq_uses_json_schema_response_format() -> None:
    seen: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return httpx.Response(200, json={"choices": [{"message": {"content": "{}"}}]})

    async with client_returning(handler) as http:
        assert await GroqProvider(http, "k", "model-x").generate_json(REQUEST) == "{}"

    body = json.loads(seen[0].content)
    assert body["model"] == "model-x"
    assert body["response_format"]["json_schema"]["name"] == "placement_quiz"
    assert seen[0].headers["Authorization"] == "Bearer k"


@pytest.mark.parametrize(
    ("status", "body", "kind"),
    [
        (429, "Quota exceeded for requests per day", FailureKind.QUOTA),
        (429, "Too many requests, slow down", FailureKind.RATE_LIMIT),
        (503, "overloaded", FailureKind.TRANSIENT),
        (400, "bad schema", FailureKind.REJECTED),
    ],
)
async def test_classifies_http_failures(status: int, body: str, kind: FailureKind) -> None:
    async with client_returning(lambda _: httpx.Response(status, text=body)) as http:
        with pytest.raises(ProviderError) as caught:
            await GeminiProvider(http, "k", "m").generate_json(REQUEST)

    assert caught.value.kind is kind
    assert "k" not in str(caught.value).split(":")[-1]  # the key never ends up in messages


async def test_a_timeout_is_transient() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ReadTimeout("slow", request=request)

    async with client_returning(handler) as http:
        with pytest.raises(ProviderError) as caught:
            await GroqProvider(http, "k", "m").generate_json(REQUEST)

    assert caught.value.kind is FailureKind.TRANSIENT


async def test_a_reply_without_text_is_an_error() -> None:
    async with client_returning(lambda _: httpx.Response(200, json={"candidates": []})) as http:
        with pytest.raises(ProviderError):
            await GeminiProvider(http, "k", "m").generate_json(REQUEST)
