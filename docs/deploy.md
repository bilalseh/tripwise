# Deploying Tripwise

Production is the Firebase project `tripwise-plan`: Hosting serves the SPA, Cloud Run serves the
API, both deployed by `.github/workflows/deploy.yml` after CI passes on `main`.

## One-time setup

1. Sign in: `gcloud auth login` with the project owner account.
2. Run `bash infra/gcp-setup.sh`. It links billing (Blaze), creates the budget alert, enables
   the APIs, creates Firestore in `us-east1`, the Artifact Registry repository, the two service
   accounts and the Workload Identity Federation pool. It is safe to re-run.
3. Create the GitHub repository `bilalseh/tripwise` and push `main`.
4. Set the three repository variables the script prints (`GCP_PROJECT_ID`, `GCP_WIF_PROVIDER`,
   `GCP_DEPLOYER_SA`). Until they exist, the deploy workflow skips itself. The `production`
   environment the deploy jobs use is created by GitHub on the first run.

## Every deploy

Push to `main`. CI runs; when it passes, Deploy:

1. builds the API image, pushes it to Artifact Registry and deploys Cloud Run (max 2 instances);
2. smoke-tests the Cloud Run URL;
3. builds the SPA and deploys Hosting, Firestore rules and indexes;
4. smoke-tests `https://tripwise-plan.web.app/api/health` through the rewrite.

A manual run is available from the Actions tab (`workflow_dispatch`).

## Local development

```sh
pnpm install
uv sync --directory api
cp api/.env.example api/.env
pnpm dev:api     # http://127.0.0.1:8000/api/docs
pnpm dev:web     # http://localhost:5173, proxies /api to the API
pnpm emulators   # Auth and Firestore emulators (needs Java 21)
```
