import logging

import httpx

from tripwise_api.ai.client import AiClient
from tripwise_api.ai.fake import FakeProvider
from tripwise_api.ai.http_providers import GeminiProvider, GroqProvider
from tripwise_api.ai.types import LlmProvider
from tripwise_api.config import Settings

logger = logging.getLogger(__name__)


def build_ai_client(settings: Settings, http: httpx.AsyncClient) -> AiClient:
    """Providers in the configured order (Gemini, then Groq when Gemini's free quota runs out);
    one without a key is left out, not an error."""
    providers: list[LlmProvider] = []
    for name in settings.ai_provider_names:
        if name == "fake":
            providers.append(FakeProvider())
        elif name == "gemini" and settings.gemini_api_key:
            key = settings.gemini_api_key.get_secret_value()
            providers.append(GeminiProvider(http, key, settings.gemini_model))
        elif name == "groq" and settings.groq_api_key:
            key = settings.groq_api_key.get_secret_value()
            providers.append(GroqProvider(http, key, settings.groq_model))
        else:
            logger.warning("AI provider %r skipped: unknown or missing its API key", name)
    return AiClient(providers)
