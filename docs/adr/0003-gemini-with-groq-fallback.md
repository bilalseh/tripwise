# 3. Gemini first, Groq as the fallback

- Status: Accepted (implemented in phase 3)
- Date: 2026-11-10

## Context

Itinerary generation and the "Ask the AI" edits need an LLM that returns strict JSON, on free
tiers only. Gemini's free tier has a daily request quota per project; a busy demo day can use it
up, and the app should keep working when that happens.

## Decision

- Providers are tried in order: Google Gemini (free tier), then Groq (free tier) when Gemini
  answers with a quota or rate-limit error (HTTP 429), a server error, or a timeout.
- Both keys live only on the API, in Secret Manager, injected into Cloud Run at deploy time.
  The browser never talks to an AI provider.
- Both providers get the same JSON Schema, generated from the Pydantic response model. Whatever
  comes back is validated by Pydantic again, then geocoded and sanity-checked, so the provider is
  never trusted (see the validation pipeline in `docs/architecture.md`).
- A deterministic `fake` provider serves local development, unit tests and E2E tests, so CI needs
  no keys and never spends quota.

"Grok free" in the brief was read as **Groq** (free API tier serving open models). xAI's Grok
API has no free tier, which would break the "no paid services" rule.

## Consequences

- Output quality can differ between providers; validation and grounding are the same for both.
- When both providers are exhausted the user sees a clear "AI is busy, try later" state, and
  every non-AI feature keeps working.
