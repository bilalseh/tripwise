# 6. Authentication, the demo account and plan limits

- Status: Accepted
- Date: 2026-11-10

## Decision

- **Google sign-in** with Firebase Auth's popup flow on the default `firebaseapp.com` domain.
- **"Try the demo"** signs in anonymously. Anonymous users only come from that button, so the API
  treats every anonymous user as a demo user. `POST /api/me` creates the profile and the two
  sample trips (Lisbon city break, Copenhagen family week) in one atomic batch, so a demo
  account is never half-seeded and concurrent first calls seed once. Each visitor gets a private
  copy: no shared data, the same rules as any user.
- **Every request carries a Firebase ID token**, verified by the Admin SDK (public keys only, no
  service-account key). The one public route is `GET /api/shared/{token}`.
- **Plans:** Free keeps 3 trips and 20 AI requests a day; Pro has unlimited trips and 100 AI
  requests a day. Demo accounts may keep 5 trips, since two are samples. A global daily AI cap
  (400) protects the shared free-tier quota. AI counts reset at midnight UTC and are refunded
  when the AI or geocoder fails.
- **Per-user rate limits** (sliding window, in process): 120 requests and 20 place searches per
  minute. Cloud Run runs at most two instances, so the worst case is twice that.

## Consequences

- Anonymous demo accounts accumulate in Firebase Auth. They cost nothing and hold only sample
  data; "Delete account" removes one completely.
