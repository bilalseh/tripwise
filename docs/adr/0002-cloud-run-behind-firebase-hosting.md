# 2. Host the API on Cloud Run behind Firebase Hosting

- Status: Accepted
- Date: 2026-11-10

## Context

The spec suggested Hugging Face Spaces or Render for the FastAPI container and ruled out Firebase
Cloud Functions. The API must answer quickly when a visitor clicks "Try the demo" and cost
nothing at portfolio traffic.

| Option              | Why not                                                                              |
| ------------------- | ------------------------------------------------------------------------------------ |
| Hugging Face Spaces | Sleeps after 48 hours idle with a slow wake; needs a long-lived service-account key. |
| Render (free)       | Sleeps after 15 minutes idle and takes 30 to 60 seconds to wake.                     |
| Cloud Functions     | Excluded by the spec; FastAPI would need a wrapper, and it runs on Cloud Run anyway. |

## Decision

- Cloud Run service `tripwise-api` in `us-east1`, next to Firestore, in the same Firebase project
  (`tripwise-plan`) on the Blaze plan. One provider, one bill.
- Firebase Hosting rewrites `/api/**` to the service, so the app and the API share one origin:
  no CORS, and the browser never sees the Cloud Run URL.
- The API runs as a dedicated service account that can only use Firestore. No key files exist.
- GitHub Actions deploys through Workload Identity Federation: short-lived credentials, issued
  only to workflows in `bilalseh/tripwise`.

### Spending guardrails

Google Cloud budgets send emails; they do not stop spending. The real limits are:

| Guardrail                 | Where                                                             |
| ------------------------- | ----------------------------------------------------------------- |
| Budget alert (50/90/100%) | `infra/gcp-setup.sh`, default 5 per month in the account currency |
| Scale to zero, max 2      | `gcloud run deploy` flags in `.github/workflows/deploy.yml`       |
| CPU only during requests  | `--cpu-throttling`, 1 vCPU, 512 MiB, 60 s timeout                 |
| Old images deleted        | `infra/artifact-cleanup-policy.json` keeps the 5 most recent      |
| Per-user AI and API caps  | API rate limits (phase 3) and plan limits (phase 8)               |
| Free-tier AI keys         | Gemini and Groq free tiers fail closed at their quota (ADR 0003)  |

An automatic shutdown at the budget (unlinking billing from a Pub/Sub trigger) was rejected: it
needs an extra always-deployed service and takes the whole app offline, including Hosting.

## Consequences

- Cold starts of a few seconds after idle periods.
- Firebase Hosting rewrites time out after 60 seconds, so long AI generations are split into
  smaller calls.
- The Firestore and Cloud Run free quotas still apply on Blaze; expected cost at portfolio
  traffic is zero.
