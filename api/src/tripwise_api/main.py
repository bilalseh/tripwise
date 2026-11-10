import secrets
from collections.abc import AsyncIterator
from contextlib import AsyncExitStack, asynccontextmanager
from dataclasses import dataclass

import httpx
from fastapi import FastAPI
from google.cloud.firestore import AsyncClient

from tripwise_api.ai.client import AiClient
from tripwise_api.ai.setup import build_ai_client
from tripwise_api.auth import FirebaseTokenVerifier, TokenVerifier
from tripwise_api.billing.stripe import Billing, StripeBilling
from tripwise_api.config import Settings, apply_emulator_hosts, load_settings
from tripwise_api.dependencies import Clock, NewId, utc_now
from tripwise_api.integrations.cache import Cache, FirestoreCache, LayeredCache, MemoryCache
from tripwise_api.integrations.fake_geocoder import FakeGeocoder
from tripwise_api.integrations.geocoding import (
    CachedGeocoder,
    FallbackGeocoder,
    Geocoder,
    NominatimGeocoder,
    PhotonGeocoder,
)
from tripwise_api.integrations.routing import NoRouter, OsrmRouter, Router, TravelService
from tripwise_api.integrations.throttle import Throttle
from tripwise_api.integrations.weather import FakeWeather, OpenMeteo, WeatherSource
from tripwise_api.logging_config import configure_logging
from tripwise_api.rate_limit import RateLimiter
from tripwise_api.repository import Repository
from tripwise_api.repository.firestore import FirestoreRepository
from tripwise_api.routes import billing, edits, essentials, health, me, places, share, trips

# Firebase Hosting forwards `/api/**` to Cloud Run with the path intact.
API_PREFIX = "/api"


def random_id() -> str:
    return secrets.token_urlsafe(12)


@dataclass(frozen=True, slots=True)
class Overrides:
    """Fakes injected by tests; anything left as None is built from settings."""

    token_verifier: TokenVerifier | None = None
    repository: Repository | None = None
    ai: AiClient | None = None
    geocoder: Geocoder | None = None
    router: Router | None = None
    weather: WeatherSource | None = None
    billing: Billing | None = None
    cache: Cache | None = None
    clock: Clock = utc_now
    new_id: NewId = random_id


def _places(settings: Settings, http: httpx.AsyncClient, cache: Cache) -> tuple[Geocoder, Router]:
    if settings.places_provider == "fake":
        return FakeGeocoder(), NoRouter()
    photon = PhotonGeocoder(http, Throttle(settings.photon_interval_seconds, concurrency=3))
    nominatim = NominatimGeocoder(http, Throttle(settings.nominatim_interval_seconds))
    geocoder = FallbackGeocoder([CachedGeocoder(photon, cache), CachedGeocoder(nominatim, cache)])
    return geocoder, OsrmRouter(http, Throttle(settings.osrm_interval_seconds))


def create_app(settings: Settings | None = None, overrides: Overrides | None = None) -> FastAPI:
    """Build the app. Uvicorn calls this with no arguments (`--factory`); tests inject fakes."""
    settings = settings or load_settings()
    fakes = overrides or Overrides()
    configure_logging(settings.log_level)
    apply_emulator_hosts(settings)

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        async with AsyncExitStack() as stack:
            firestore: AsyncClient | None = None
            if fakes.repository is None or fakes.cache is None:
                # Created inside the running event loop, as the gRPC async client requires.
                firestore = AsyncClient(project=settings.firebase_project_id)
                stack.callback(firestore.close)
            app.state.repository = fakes.repository or FirestoreRepository(firestore)  # type: ignore[arg-type]
            cache = fakes.cache or LayeredCache(MemoryCache(), FirestoreCache(firestore))  # type: ignore[arg-type]
            http = await stack.enter_async_context(
                httpx.AsyncClient(timeout=settings.ai_timeout_seconds)
            )
            geocoder, router = _places(settings, http, cache)
            app.state.geocoder = fakes.geocoder or geocoder
            app.state.travel = TravelService(fakes.router or router, cache)
            app.state.weather = fakes.weather or (
                FakeWeather() if settings.places_provider == "fake" else OpenMeteo(http, cache)
            )
            app.state.ai = fakes.ai or build_ai_client(settings, http)
            key = settings.stripe_secret_key
            app.state.billing = fakes.billing or (
                StripeBilling(http, key.get_secret_value()) if key else None
            )
            yield

    docs_enabled = settings.environment != "production"
    app = FastAPI(
        title="Tripwise API",
        version=settings.app_version,
        docs_url=f"{API_PREFIX}/docs" if docs_enabled else None,
        redoc_url=None,
        openapi_url=f"{API_PREFIX}/openapi.json" if docs_enabled else None,
        lifespan=lifespan,
    )
    app.state.settings = settings
    app.state.clock = fakes.clock
    app.state.new_id = fakes.new_id
    app.state.limiter = RateLimiter()
    app.state.token_verifier = fakes.token_verifier or FirebaseTokenVerifier(
        settings.firebase_project_id
    )

    for module in (health, me, trips, edits, places, essentials, share, billing):
        app.include_router(module.router, prefix=API_PREFIX)
    return app
