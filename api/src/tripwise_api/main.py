from fastapi import FastAPI

from tripwise_api.auth import FirebaseTokenVerifier, TokenVerifier
from tripwise_api.config import Settings, apply_emulator_hosts, load_settings
from tripwise_api.logging_config import configure_logging
from tripwise_api.routes import health

# Firebase Hosting forwards `/api/**` to Cloud Run with the path intact.
API_PREFIX = "/api"


def create_app(
    settings: Settings | None = None,
    token_verifier: TokenVerifier | None = None,
) -> FastAPI:
    """Build the app. Uvicorn calls this with no arguments (`--factory`); tests inject fakes."""
    settings = settings or load_settings()
    configure_logging(settings.log_level)
    apply_emulator_hosts(settings)

    docs_enabled = settings.environment != "production"
    app = FastAPI(
        title="Tripwise API",
        version=settings.app_version,
        docs_url=f"{API_PREFIX}/docs" if docs_enabled else None,
        redoc_url=None,
        openapi_url=f"{API_PREFIX}/openapi.json" if docs_enabled else None,
    )
    app.state.settings = settings
    app.state.token_verifier = token_verifier or FirebaseTokenVerifier(settings.firebase_project_id)

    app.include_router(health.router, prefix=API_PREFIX)
    return app
