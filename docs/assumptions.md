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

## Phases 2 to 10 (built together on request, "go with all phases at once")

| Area      | Assumption                                                                                                                                                      |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Data      | Days and stops are embedded in the trip document; all writes go through the API (ADR 0005).                                                                     |
| Trips     | At most 14 days and 3 destinations per trip; days are split between destinations in the wizard.                                                                 |
| Wizard    | Destinations must be picked from geocoder results, so every trip starts from real coordinates.                                                                  |
| Wizard    | "Dates or number of days": without dates there is no forecast and no calendar export.                                                                           |
| AI        | Generation runs four days per request; regenerating keeps locked stops on their day.                                                                            |
| AI        | Edits are proposals: the API saves nothing until the user accepts the diff.                                                                                     |
| Grounding | Photon is the main geocoder (it allows concurrent requests); Nominatim is the fallback (ADR 0007).                                                              |
| Grounding | A suggestion is dropped if the lookups find only a city-level match, a differently named place, or one outside the destination radius (its size, 60 to 400 km). |
| Grounding | Wikidata is the landmark fallback; days left two or more stops short get one AI replacement round.                                                              |
| Travel    | Legs up to 2 km (after a 1.3 detour factor) are walked; longer legs use OSRM driving or an estimate.                                                            |
| Budget    | Food stops count toward food, other stops toward activities; estimates are for the whole group.                                                                 |
| Budget    | Amounts stay in the trip's currency; the home currency is the default for new trips (no FX).                                                                    |
| Packing   | Rule-based (climate band, season, length, interests, travellers), not AI, so it is free and tested.                                                             |
| Packing   | Clothing quantities are per person, capped at 7 (laundry bag added after 4 days).                                                                               |
| Documents | Passport validity shown as six months after the return date, labelled as a common rule.                                                                         |
| Documents | Entry rules: links to EU, US, UK, Canadian and Australian government sources only.                                                                              |
| Weather   | Beyond Open-Meteo's 16-day forecast, the same dates last year are shown as "typical", labelled.                                                                 |
| Share     | Links are 144-bit random tokens; public views exclude notes, budget, packing and documents.                                                                     |
| PDF       | Print-to-PDF page instead of a JS PDF library, for correct Arabic shaping (ADR 0008).                                                                           |
| Plans     | Free: 3 trips, 20 AI/day. Pro: unlimited trips, 100 AI/day, $5/month in Stripe test mode. Demo: 5 trips.                                                        |
| Language  | Switching language while signed in also saves it as the account's preference.                                                                                   |
| Demo      | Anonymous demo accounts are not auto-deleted; they hold only sample data and can delete themselves.                                                             |
| Keys      | Without Gemini/Groq keys in Secret Manager, production runs the deterministic fake AI so the demo still works.                                                  |
