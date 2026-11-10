"""Gemini and Groq over plain REST. Keys stay on the server and never appear in logs."""

from typing import Any

import httpx

from tripwise_api.ai.types import AiRequest, FailureKind, ProviderError


def _failure_kind(response: httpx.Response) -> FailureKind:
    if response.status_code == httpx.codes.TOO_MANY_REQUESTS:
        body = response.text.lower()
        daily = "per day" in body or "perday" in body or "quota" in body
        return FailureKind.QUOTA if daily else FailureKind.RATE_LIMIT
    if response.status_code >= httpx.codes.INTERNAL_SERVER_ERROR:
        return FailureKind.TRANSIENT
    return FailureKind.REJECTED


def _reason(response: httpx.Response) -> str:
    """The provider's own error message (never contains the key), shortened for logs."""
    try:
        error = response.json().get("error", {})
    except ValueError:
        return ""
    message = error.get("message", "") if isinstance(error, dict) else str(error)
    return str(message)[:160]


async def _post_json(
    provider: str,
    client: httpx.AsyncClient,
    url: str,
    body: dict[str, Any],
    headers: dict[str, str],
) -> Any:
    try:
        response = await client.post(url, json=body, headers=headers)
    except httpx.TimeoutException as exc:
        raise ProviderError(provider, FailureKind.TRANSIENT, "timed out") from exc
    except httpx.HTTPError as exc:
        raise ProviderError(provider, FailureKind.TRANSIENT, type(exc).__name__) from exc
    if response.is_error:
        raise ProviderError(
            provider, _failure_kind(response), f"HTTP {response.status_code} {_reason(response)}"
        )
    return response.json()


class GeminiProvider:
    name = "gemini"

    def __init__(self, client: httpx.AsyncClient, api_key: str, model: str) -> None:
        self._client = client
        self._api_key = api_key
        self._model = model

    async def generate_json(self, request: AiRequest) -> str:
        url = (
            f"https://generativelanguage.googleapis.com/v1beta/models/{self._model}:generateContent"
        )
        body = {
            "systemInstruction": {"parts": [{"text": request.system}]},
            "contents": [{"role": "user", "parts": [{"text": request.prompt}]}],
            "generationConfig": {
                "responseMimeType": "application/json",
                "responseJsonSchema": request.schema,
                "temperature": request.temperature,
            },
        }
        data = await _post_json(
            self.name, self._client, url, body, {"x-goog-api-key": self._api_key}
        )
        try:
            return str(data["candidates"][0]["content"]["parts"][0]["text"])
        except (KeyError, IndexError, TypeError) as exc:
            raise ProviderError(self.name, FailureKind.TRANSIENT, "no text in reply") from exc


class GroqProvider:
    name = "groq"

    def __init__(self, client: httpx.AsyncClient, api_key: str, model: str) -> None:
        self._client = client
        self._api_key = api_key
        self._model = model

    async def generate_json(self, request: AiRequest) -> str:
        body = {
            "model": self._model,
            "temperature": request.temperature,
            "messages": [
                {"role": "system", "content": request.system},
                {"role": "user", "content": request.prompt},
            ],
            "response_format": {
                "type": "json_schema",
                "json_schema": {"name": request.task, "schema": request.schema},
            },
        }
        headers = {"Authorization": f"Bearer {self._api_key}"}
        url = "https://api.groq.com/openai/v1/chat/completions"
        data = await _post_json(self.name, self._client, url, body, headers)
        try:
            return str(data["choices"][0]["message"]["content"])
        except (KeyError, IndexError, TypeError) as exc:
            raise ProviderError(self.name, FailureKind.TRANSIENT, "no content in reply") from exc
