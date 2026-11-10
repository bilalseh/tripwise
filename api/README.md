# Tripwise API

FastAPI service on Python 3.12, managed with [uv](https://docs.astral.sh/uv/). In production it
runs on Cloud Run behind the Firebase Hosting rewrite for `/api/**` (see
[ADR 0002](../docs/adr/0002-cloud-run-behind-firebase-hosting.md)).

```sh
uv sync                      # install dependencies (uv downloads Python 3.12 if needed)
cp .env.example .env         # local settings, pointed at the Firebase emulators
uv run uvicorn tripwise_api.main:create_app --factory --reload --port 8000

uv run ruff check .          # lint
uv run ruff format --check . # formatting
uv run mypy                  # strict type check
uv run pytest                # tests
```

Interactive docs are served at `http://localhost:8000/api/docs` outside production.
