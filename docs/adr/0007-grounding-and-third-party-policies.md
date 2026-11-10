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

**Grounding** (`planning/grounding.py`, `planning/names.py`), for each suggestion:

1. Search OpenStreetMap (Photon, Nominatim as fallback) for "name, area" and "name,
   destination", then for simpler forms of the name: without parentheses, and each side of a
   subtitle ("MAAT - Museum of Art, Architecture and Technology" also tries "MAAT"). At most
   four searches per suggestion and lookup.
2. Accept the first result that is a specific place (not a city or region), whose name
   resembles the suggestion, and that lies within the destination's search radius:
   - **Name check:** the names share a distinctive word (generic words like "museum",
     "history", "old town" do not count), or one contains the other. A suggestion made only of
     generic words ("City History Museum") must match exactly, so a geocoder cannot answer it
     with some other real museum. Names in different scripts are not compared.
   - **Radius:** half the diagonal of the destination's bounding box (from the geocoder, when
     the user picked it), times 1.15, between 60 and 400 km. Older trips whose destination is a
     whole country use 250 km; any other destination uses 60 km.
   - **Area hint:** when the AI's area for a stop ("Byblos") is itself found inside the
     destination, the search is centred there with a town-sized radius (its size times 1.5,
     8 to 60 km), so a same-named place in another town is not picked.
3. If OpenStreetMap has no acceptable match, ask **Wikidata** (labels and aliases in many
   languages, coordinates from property P625). A matched alias counts for the name check.
4. Otherwise drop the suggestion and list it in the trip's grounding report, which the UI shows.
5. **One replacement round:** if a day ends up two or more stops short of its pace, the AI is
   asked once for replacements, told which names were not found, and the replacements are
   grounded the same way. It is skipped when the first answer took over 25 seconds, so the
   request stays inside Hosting's 60-second limit, and when the AI is unavailable.

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
| Wikidata         | Landmark fallback when OSM finds no match  | Identifying User-Agent, 0.3 s spacing, two concurrent requests, 30-day cache                                                            |

Caches are two-level (in-process LRU, then Firestore `cache/*` with a TTL policy on `expireAt`).

**Labels:** walking legs are straight-line estimates with a 1.3 detour factor; driving legs say
"road route (OSRM)" or "estimate". Costs and durations always read as estimates. Visa and entry
rules are links to official government sources only.

## Consequences

- Generation takes a few seconds longer than raw AI output, in exchange for no invented places.
- Long trips are generated four days per request, so each call fits Hosting's 60-second limit.
