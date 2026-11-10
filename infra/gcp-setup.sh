#!/usr/bin/env bash
# One-time Google Cloud setup for Tripwise. Safe to re-run: existing resources are skipped.
#
# Prerequisites: the Firebase project exists and `gcloud auth login` has been run with an
# account that owns the project and can manage the billing account.
#
# Usage: bash infra/gcp-setup.sh
#   Override any default with an environment variable, for example:
#   BUDGET_AMOUNT=10 bash infra/gcp-setup.sh
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-tripwise-plan}"
REGION="${REGION:-us-east1}"
GITHUB_REPO="${GITHUB_REPO:-bilalseh/tripwise}"
BILLING_ACCOUNT="${BILLING_ACCOUNT:-01BF07-7FEB23-08D500}"
# Monthly budget in the billing account's currency. Alerts only; it does not stop spending.
BUDGET_AMOUNT="${BUDGET_AMOUNT:-5}"
AR_REPO="tripwise"
RUNTIME_SA="tripwise-api"
DEPLOYER_SA="github-deployer"
POOL="github"
PROVIDER="github-oidc"
BUDGET_NAME="Tripwise monthly"

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
project_number="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
runtime_email="$RUNTIME_SA@$PROJECT_ID.iam.gserviceaccount.com"
deployer_email="$DEPLOYER_SA@$PROJECT_ID.iam.gserviceaccount.com"

echo "==> Billing (Blaze): link $PROJECT_ID to $BILLING_ACCOUNT"
current_billing="$(gcloud billing projects describe "$PROJECT_ID" --format='value(billingAccountName)')"
if [ "$current_billing" != "billingAccounts/$BILLING_ACCOUNT" ]; then
  gcloud billing projects link "$PROJECT_ID" --billing-account "$BILLING_ACCOUNT"
fi

echo "==> Enabling APIs"
gcloud services enable --project "$PROJECT_ID" \
  run.googleapis.com \
  artifactregistry.googleapis.com \
  iamcredentials.googleapis.com \
  sts.googleapis.com \
  firestore.googleapis.com \
  firebasehosting.googleapis.com \
  firebaserules.googleapis.com \
  cloudresourcemanager.googleapis.com \
  billingbudgets.googleapis.com

echo "==> Budget alert: $BUDGET_AMOUNT per month, emails at 50%, 90% and 100%"
if ! gcloud billing budgets list --billing-account "$BILLING_ACCOUNT" \
  --billing-project "$PROJECT_ID" --format='value(displayName)' | grep -qx "$BUDGET_NAME"; then
  gcloud billing budgets create \
    --billing-account "$BILLING_ACCOUNT" \
    --billing-project "$PROJECT_ID" \
    --display-name "$BUDGET_NAME" \
    --budget-amount "$BUDGET_AMOUNT" \
    --filter-projects "projects/$PROJECT_ID" \
    --threshold-rule percent=0.5 \
    --threshold-rule percent=0.9 \
    --threshold-rule percent=1.0
fi

echo "==> Firestore (default) database in $REGION"
if ! gcloud firestore databases describe --database='(default)' --project "$PROJECT_ID" >/dev/null 2>&1; then
  gcloud firestore databases create --location "$REGION" --project "$PROJECT_ID"
fi

echo "==> Firestore TTL: cached geocoding, routing and weather answers expire on their own"
gcloud firestore fields ttls update expireAt --collection-group cache --enable-ttl \
  --project "$PROJECT_ID" --quiet >/dev/null || echo "  (TTL policy already set or still applying)"

echo "==> Artifact Registry repository with an image cleanup policy"
if ! gcloud artifacts repositories describe "$AR_REPO" --location "$REGION" --project "$PROJECT_ID" >/dev/null 2>&1; then
  gcloud artifacts repositories create "$AR_REPO" \
    --repository-format docker --location "$REGION" --project "$PROJECT_ID" \
    --description "Tripwise API images"
fi
gcloud artifacts repositories set-cleanup-policies "$AR_REPO" \
  --location "$REGION" --project "$PROJECT_ID" \
  --policy "$script_dir/artifact-cleanup-policy.json" --no-dry-run

echo "==> Service accounts"
ensure_sa() {
  if ! gcloud iam service-accounts describe "$1@$PROJECT_ID.iam.gserviceaccount.com" --project "$PROJECT_ID" >/dev/null 2>&1; then
    gcloud iam service-accounts create "$1" --display-name "$2" --project "$PROJECT_ID"
    # New accounts take a few seconds to become visible to IAM.
    sleep 10
  fi
}
ensure_sa "$RUNTIME_SA" "Tripwise API runtime"
ensure_sa "$DEPLOYER_SA" "GitHub Actions deployer"

grant() {
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member "serviceAccount:$1" --role "$2" --condition None --quiet >/dev/null
}

# Runtime: read and write Firestore, nothing else.
grant "$runtime_email" roles/datastore.user

# Deployer: push images, deploy Cloud Run, deploy Hosting, rules and indexes.
for role in \
  roles/run.admin \
  roles/artifactregistry.writer \
  roles/firebasehosting.admin \
  roles/firebaserules.admin \
  roles/datastore.indexAdmin \
  roles/serviceusage.serviceUsageConsumer; do
  grant "$deployer_email" "$role"
done
# The deployer may run the service as the runtime account, and only that account.
gcloud iam service-accounts add-iam-policy-binding "$runtime_email" \
  --member "serviceAccount:$deployer_email" --role roles/iam.serviceAccountUser \
  --project "$PROJECT_ID" --quiet >/dev/null

echo "==> Workload Identity Federation for $GITHUB_REPO"
if ! gcloud iam workload-identity-pools describe "$POOL" --location global --project "$PROJECT_ID" >/dev/null 2>&1; then
  gcloud iam workload-identity-pools create "$POOL" \
    --location global --project "$PROJECT_ID" --display-name "GitHub Actions"
fi
if ! gcloud iam workload-identity-pools providers describe "$PROVIDER" \
  --workload-identity-pool "$POOL" --location global --project "$PROJECT_ID" >/dev/null 2>&1; then
  gcloud iam workload-identity-pools providers create-oidc "$PROVIDER" \
    --workload-identity-pool "$POOL" --location global --project "$PROJECT_ID" \
    --display-name "GitHub OIDC" \
    --issuer-uri "https://token.actions.githubusercontent.com" \
    --attribute-mapping "google.subject=assertion.sub,attribute.repository=assertion.repository" \
    --attribute-condition "assertion.repository == '$GITHUB_REPO'"
fi
gcloud iam service-accounts add-iam-policy-binding "$deployer_email" \
  --role roles/iam.workloadIdentityUser \
  --member "principalSet://iam.googleapis.com/projects/$project_number/locations/global/workloadIdentityPools/$POOL/attribute.repository/$GITHUB_REPO" \
  --project "$PROJECT_ID" --quiet >/dev/null

cat <<EOF

Done. Set these GitHub repository variables (Settings > Secrets and variables > Actions > Variables),
or run the gh commands below:
  gh variable set GCP_PROJECT_ID --repo $GITHUB_REPO --body "$PROJECT_ID"
  gh variable set GCP_WIF_PROVIDER --repo $GITHUB_REPO --body "projects/$project_number/locations/global/workloadIdentityPools/$POOL/providers/$PROVIDER"
  gh variable set GCP_DEPLOYER_SA --repo $GITHUB_REPO --body "$deployer_email"
EOF
