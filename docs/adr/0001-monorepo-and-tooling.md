# 1. Monorepo layout and tooling

- Status: Accepted
- Date: 2026-11-10

## Context

Tripwise has a React frontend, a Python API, pure domain logic used by the client, and Firebase
configuration. They change together (an API model change touches the web types), so they live
in one repository.

## Decision

| Path        | What                                                     | Tooling                                      |
| ----------- | -------------------------------------------------------- | -------------------------------------------- |
| `web/`      | React 19 + TypeScript (strict) + Vite SPA                | pnpm, ESLint (type-checked), Vitest, RTL     |
| `shared/`   | Generated API types plus framework-free TypeScript logic | pnpm, Vitest                                 |
| `api/`      | FastAPI service, Pydantic models, Python domain logic    | uv, Python 3.12, Ruff, mypy `strict`, pytest |
| `firebase/` | Firestore rules, indexes and their emulator tests        | Firebase emulators, Vitest                   |
| `e2e/`      | Playwright tests that run the real web app and API       | Playwright (desktop and phone projects)      |
| `infra/`    | One-time Google Cloud setup script and policies          | bash, gcloud                                 |
| `docs/`     | Architecture, decisions, assumptions, deploy guide       | Markdown                                     |

- pnpm workspaces for the TypeScript packages; `api/` stays outside pnpm with its own lockfile.
- React Router for routing, TanStack Query for server state; Zustand (itinerary state and
  undo/redo), React Hook Form + Zod, MapLibre GL JS and dnd-kit arrive in the phases that use them.
- Tailwind CSS v4 with logical properties (`ms-`, `ps-`, `start-`) from the first component, so
  the Arabic right-to-left pass does not mean rewriting layouts.
- All UI text goes through i18next from day one, with English and Arabic resource files.
- Prettier formats the TypeScript side; Ruff formats Python. CI fails on unformatted code.

## Consequences

- One `pnpm install` and one `uv sync` set up everything.
- Domain logic lives in two languages: client-side edit operations (reorder, undo/redo, budget
  totals) in `shared/`, generation-time logic (clustering, AI sanity checks) in `api/`. Only the
  API contract crosses the boundary, and it is generated (see ADR 0004).
