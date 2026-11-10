# Tripwise

Plan a trip in minutes: a short wizard, an AI-built day-by-day itinerary on a map, a budget, a
packing list and a documents checklist, all editable, saved and shareable.

**Status:** phase 1 of 10 (project shell). Live at <https://tripwise-plan.web.app>.

## Why it is more than an AI chat

- The plan lives on a map with real places and travel times. Every AI suggestion is resolved to
  a real place through a geocoder before it is shown.
- You edit it by dragging; it re-plans when something changes, and every change can be undone.
- Everything for the trip stays in one place: budget, packing list, documents, weather.

Planning only: no bookings, payments or affiliate links. Visa rules are links to official sources.

## Stack

| Layer    | Choice                                                                             |
| -------- | ---------------------------------------------------------------------------------- |
| Frontend | React 19, TypeScript (strict), Vite, Tailwind CSS v4, React Router, TanStack Query |
| Backend  | Python 3.12, FastAPI, Pydantic, uv                                                 |
| Data     | Firestore, Firebase Auth                                                           |
| AI       | Gemini free tier, Groq free tier as the fallback                                   |
| Hosting  | Firebase Hosting, Cloud Run behind a `/api/**` rewrite                             |
| CI/CD    | GitHub Actions, keyless deploys through Workload Identity Federation               |

## Repository

```
web/        React SPA
shared/     generated API types and framework-free TypeScript domain logic
api/        FastAPI service
firebase/   Firestore rules, indexes and their emulator tests
e2e/        Playwright tests (desktop and phone)
infra/      one-time Google Cloud setup
docs/       architecture, decisions (adr/), assumptions, deploy guide
```

## Run locally

Requires Node 22, pnpm 10, [uv](https://docs.astral.sh/uv/), and Java 21 for the emulators.

```sh
pnpm install
uv sync --directory api
cp api/.env.example api/.env
pnpm dev:api        # API on :8000
pnpm dev:web        # app on :5173
```

Checks: `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:rules`,
`pnpm test:e2e`, and in `api/`: `uv run ruff check .`, `uv run mypy`, `uv run pytest`.

## Documentation

- [Architecture](docs/architecture.md)
- [Decisions](docs/adr/)
- [Assumptions](docs/assumptions.md)
- [Deploying](docs/deploy.md)

## Build order

1. Monorepo, tooling, CI, Firebase config, deployed shell
2. Auth, demo mode, trip wizard
3. Backend + AI itinerary generation with validation and geocoding
4. Map, day view, drag-and-drop editing, undo/redo
5. AI edit actions with preview diff
6. Budget, packing list, documents checklist, weather
7. Share link, PDF and .ics export, trip templates
8. Pricing page with Stripe test mode, usage limits, settings
9. Arabic/RTL, accessibility and responsive passes
10. README, screenshots, GIF, final deploy

## License

[MIT](LICENSE)
