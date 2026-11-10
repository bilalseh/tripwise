"""Public API models. Each one is exported to /shared as TypeScript (and Zod for requests)."""

from pydantic import BaseModel

from tripwise_api.schemas.health import HealthResponse

# Requests also get Zod schemas on the web side, for form validation.
REQUEST_MODELS: tuple[type[BaseModel], ...] = ()
RESPONSE_MODELS: tuple[type[BaseModel], ...] = (HealthResponse,)

__all__ = ["REQUEST_MODELS", "RESPONSE_MODELS", "HealthResponse"]
