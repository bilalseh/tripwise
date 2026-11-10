# Deploying Tripwise

Production is the Firebase project `tripwise-plan`: Hosting serves the SPA, Cloud Run serves the
API, both deployed by `.github/workflows/deploy.yml` after CI passes on `main`.

## One-time setup

1. `gcloud auth login` with the project owner account.
2. `bash infra/gcp-setup.sh`: links billing (Blaze), creates the budget alert, enables the APIs,
   creates Firestore in `us-east1` with a TTL policy on the cache, the Artifact Registry
   repository, the two service accounts and the Workload Identity Federation pool. Safe to re-run.
3. Set the GitHub repository variables the script prints (`GCP_PROJECT_ID`, `GCP_WIF_PROVIDER`,
   `GCP_DEPLOYER_SA`), plus the public Firebase web config: `FIREBASE_API_KEY` and
   `FIREBASE_APP_ID` (from `firebase apps:sdkconfig WEB`).
4. Firebase console > Authentication > Get started, then enable the **Google** and
   **Anonymous** providers. `tripwise-plan.web.app` is an authorized domain by default.

## AI and Stripe keys (optional, any time)

`bash infra/set-secrets.sh` asks for the Gemini, Groq and Stripe **test** keys, stores them in
Secret Manager (readable only by the API's service account) and sets the `APP_SECRETS`
repository variable. The next deploy mounts them and switches the AI from the fake provider to
`gemini,groq`. Without them the live demo runs the deterministic fake AI and the pricing page
says test-mode checkout is not set up.

For Stripe, create a test-mode webhook endpoint for
`https://tripwise-plan.web.app/api/billing/webhook` with the events
`checkout.session.completed` and `customer.subscription.deleted`.

## Every deploy

Push to `main`. CI runs; when it passes, Deploy:

1. builds the API image, pushes it to Artifact Registry and deploys Cloud Run;
2. smoke-tests the Cloud Run URL;
3. builds the SPA with the Firebase config and deploys Hosting, Firestore rules and indexes;
4. smoke-tests `https://tripwise-plan.web.app/api/health` through the rewrite.

A manual run is available from the Actions tab (`workflow_dispatch`).
