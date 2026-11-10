# 4. Pydantic models are the source of truth for the API contract

- Status: Accepted
- Date: 2026-11-10

## Context

The web app and the API must agree on every request and response shape. Writing the types twice
lets them drift silently.

## Decision

- Every request and response is a Pydantic model in `api/src/tripwise_api/schemas/`.
- `pnpm gen:schemas` exports them as one JSON Schema (`shared/schemas/api.json`) and generates
  TypeScript types for all of them, plus Zod schemas for request models (used in forms).
- Generated files are committed. A CI job regenerates them and fails if anything changed, so a
  model change without regenerated types cannot merge.

## Consequences

- Changing the contract is a two-step edit: the Pydantic model, then `pnpm gen:schemas`.
- The same JSON Schema is reused as the structured-output schema sent to the AI providers.
