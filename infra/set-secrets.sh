#!/usr/bin/env bash
# Stores Tripwise's keys in Secret Manager, lets only the API's runtime account read them, and
# points the deploy at them. Safe to re-run: each key you enter adds a new secret version, and
# keys you skip keep their current value. Keys are read without echoing them.
#
# Create the keys first (all free):
#   Gemini: https://aistudio.google.com/apikey  (use a project with billing OFF, so the free
#           tier can never turn into charges)
#   Groq:   https://console.groq.com/keys
#   Stripe: https://dashboard.stripe.com/test/apikeys  (TEST mode secret key, sk_test_...)
#           Webhook signing secret (whsec_...) from a test-mode webhook endpoint for
#           https://tripwise-plan.web.app/api/billing/webhook with the events
#           checkout.session.completed and customer.subscription.deleted
#
# Needs gcloud (signed in as a project owner) and gh (signed in to GitHub).
# Usage: bash infra/set-secrets.sh
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-tripwise-plan}"
REPO="${REPO:-bilalseh/tripwise}"
runtime_email="tripwise-api@$PROJECT_ID.iam.gserviceaccount.com"

gcloud services enable secretmanager.googleapis.com --project "$PROJECT_ID"

store_secret() {
  local secret="$1" label="$2" prefix="$3" value
  read -r -s -p "$label (leave empty to keep or skip): " value
  echo
  if [ -z "$value" ]; then
    return
  fi
  if [[ "$value" != "$prefix"* ]]; then
    echo "  not stored: a $label starts with $prefix" >&2
    return
  fi
  if ! gcloud secrets describe "$secret" --project "$PROJECT_ID" >/dev/null 2>&1; then
    gcloud secrets create "$secret" --replication-policy automatic --project "$PROJECT_ID"
  fi
  printf '%s' "$value" | gcloud secrets versions add "$secret" --data-file=- --project "$PROJECT_ID" >/dev/null
  gcloud secrets add-iam-policy-binding "$secret" --project "$PROJECT_ID" \
    --member "serviceAccount:$runtime_email" --role roles/secretmanager.secretAccessor >/dev/null
  echo "  stored $label"
}

store_secret gemini-api-key "Gemini API key" ""  # Google issues keys in more than one format
store_secret groq-api-key "Groq API key" "gsk_"
store_secret stripe-secret-key "Stripe TEST secret key" "sk_test_"
store_secret stripe-webhook-secret "Stripe webhook signing secret" "whsec_"

# Mount every secret that exists, including ones stored on an earlier run.
mounts=()
for pair in GEMINI_API_KEY=gemini-api-key GROQ_API_KEY=groq-api-key \
  STRIPE_SECRET_KEY=stripe-secret-key STRIPE_WEBHOOK_SECRET=stripe-webhook-secret; do
  if gcloud secrets describe "${pair#*=}" --project "$PROJECT_ID" >/dev/null 2>&1; then
    mounts+=("$pair:latest")
  fi
done
if [ ${#mounts[@]} -eq 0 ]; then
  echo "No keys stored."
  exit 0
fi

value=$(IFS=,; echo "${mounts[*]}")
gh variable set APP_SECRETS --repo "$REPO" --body "$value"
echo
echo "Set APP_SECRETS=$value"
echo "Deploy with: gh workflow run Deploy --repo $REPO"
