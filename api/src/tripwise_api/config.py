"""Runtime configuration, read from environment variables (and `api/.env` locally)."""

import os
from typing import Literal

from pydantic import SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

Environment = Literal["local", "test", "production"]
LogLevel = Literal["DEBUG", "INFO", "WARNING", "ERROR"]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        frozen=True,
    )

    environment: Environment = "local"
    app_version: str = "dev"
    firebase_project_id: str
    log_level: LogLevel = "INFO"
    firestore_emulator_host: str | None = None
    firebase_auth_emulator_host: str | None = None
    app_url: str = "http://localhost:5173"

    # AI providers, tried in this order. "fake" is deterministic and needs no key.
    ai_providers: str = "gemini,groq"
    gemini_api_key: SecretStr | None = None
    gemini_model: str = "gemini-flash-latest"
    groq_api_key: SecretStr | None = None
    groq_model: str = "openai/gpt-oss-120b"
    # Per provider. Firebase Hosting gives up after 60 s, so a fallback must still fit.
    ai_timeout_seconds: float = 22
    ai_daily_limit_free: int = 20
    ai_daily_limit_pro: int = 100
    ai_daily_limit_global: int = 400

    # Places, routing and weather. "fake" runs offline (tests, E2E, local without network).
    places_provider: Literal["osm", "fake"] = "osm"
    # Nominatim allows one request per second per application; Cloud Run runs up to two
    # instances, so each waits two seconds between calls.
    nominatim_interval_seconds: float = 2.0
    photon_interval_seconds: float = 0.25
    osrm_interval_seconds: float = 1.0
    wikidata_interval_seconds: float = 0.3

    # Per-user request limits per minute (in-process, per instance).
    rate_limit_per_minute: int = 120
    search_limit_per_minute: int = 20

    # Billing runs in Stripe TEST MODE only; a live key is refused at startup.
    stripe_secret_key: SecretStr | None = None
    stripe_webhook_secret: SecretStr | None = None

    @field_validator("stripe_secret_key")
    @classmethod
    def _test_mode_only(cls, value: SecretStr | None) -> SecretStr | None:
        if value and not value.get_secret_value().startswith(("sk_test_", "rk_test_")):
            raise ValueError("only Stripe test-mode keys (sk_test_... or rk_test_...) are allowed")
        return value

    @property
    def ai_provider_names(self) -> list[str]:
        return [name.strip() for name in self.ai_providers.split(",") if name.strip()]


def load_settings() -> Settings:
    return Settings()


def apply_emulator_hosts(settings: Settings) -> None:
    """The Google SDKs read emulator hosts only from os.environ, so values that came from
    api/.env are copied there. Never applied in production."""
    if settings.environment == "production":
        return
    hosts = {
        "FIRESTORE_EMULATOR_HOST": settings.firestore_emulator_host,
        "FIREBASE_AUTH_EMULATOR_HOST": settings.firebase_auth_emulator_host,
    }
    for name, value in hosts.items():
        if value:
            os.environ.setdefault(name, value)
