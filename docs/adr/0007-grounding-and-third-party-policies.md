# 7. Grounding AI suggestions in real places, within free APIs' usage policies

- Status: Accepted
- Date: 2026-11-10

## Context

The AI must never be the source of an address, coordinate, price or opening hour. Every place
shown must be real. The map, geocoding, routing and weather services must be free, and their
usage policies respected.

## Decision

**What the AI returns** (`planning/ai_models.py`): place names, an area hint, category, time
slot, a one-line reason, and duration and cost estimates. No coordinates, addresses or hours.

**Grounding** (`planning/grounding.py`), for each suggestion:

1. Search the geocoder for "name, area", biased to the destination, falling back to
   "name, destination".
2. Keep the first result that is a specific place (not a city or region) within 60 km of the
   destination. The name, address and coordinates shown are the geocoder's.
3. Otherwise drop the suggestion and list it in the trip's grounding report, which the UI shows.

Then the layout step clusters stops by area (balanced k-means, locked stops pinned), orders each
day by time slot with nearest neighbour plus 2-opt, and trims days that exceed the pace's limits
(locked and must-see stops are never trimmed).

**Services and policies**

| Service          | Use                                        | Policy kept                                                                                                                             |
| ---------------- | ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| Photon (komoot)  | Main geocoder for suggestions              | Fair use: 3 concurrent requests, 0.25 s spacing, 30-day cache                                                                           |
| Nominatim        | Fallback geocoder                          | 1 request/s per app: 2 s spacing per instance (max 2 instances), identifying User-Agent, cache, search on submit only (no autocomplete) |
| OSRM demo server | Driving times for legs over 2 km           | 1 request/s, cached 14 days, straight-line estimate on any failure                                                                      |
| OpenFreeMap      | Vector map tiles                           | No key, attribution shown by the map                                                                                                    |
| Open-Meteo       | Forecast (16 days) and last year's weather | Non-commercial free tier, cached                                                                                                        |

Caches are two-level (in-process LRU, then Firestore `cache/*` with a TTL policy on `expireAt`).

**Labels:** walking legs are straight-line estimates with a 1.3 detour factor; driving legs say
"road route (OSRM)" or "estimate". Costs and durations always read as estimates. Visa and entry
rules are links to official government sources only.

## Consequences

- Generation takes a few seconds longer than raw AI output, in exchange for no invented places.
- Long trips are generated four days per request, so each call fits Hosting's 60-second limit.
