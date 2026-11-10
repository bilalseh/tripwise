# Assumptions

Decisions taken without an explicit answer in the brief, so they can be reviewed in one place.

| Date       | Assumption                                                                                      |
| ---------- | ----------------------------------------------------------------------------------------------- |
| 2026-11-10 | Firebase project ID is `tripwise-plan` (`tripwise-planner` was taken): `tripwise-plan.web.app`. |
| 2026-11-10 | Region `us-east1` for Firestore and Cloud Run. The Firestore location cannot change later.      |
| 2026-11-10 | Monthly budget alert of 5 in the billing account's currency, with no automatic shutdown.        |
| 2026-11-10 | Public repo `bilalseh/tripwise`, deploying straight from `main` after CI passes.                |
| 2026-11-10 | "Grok free" means Groq's free API tier (see ADR 0003).                                          |
| 2026-11-10 | React Router instead of TanStack Router: fewer moving parts for a mostly flat route tree.       |
| 2026-11-10 | i18n and logical (start/end) CSS from phase 1; the full Arabic and RTL pass stays in phase 9.   |
| 2026-11-10 | Firestore rules deny everything until phase 2 opens each collection with tests.                 |
