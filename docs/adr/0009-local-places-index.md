# 9. A local places index for Lebanon, built from Overture Maps

- Status: Accepted
- Date: 2026-11-18

## Context

OpenStreetMap has thin coverage of restaurants and sights in Lebanon, and its free search services
allow about one request per second. Long trips ran out of time checking places, and real places
such as local restaurant chains could not be found at all.

Google Places was ruled out: its terms forbid showing its content on a non-Google map, limit how
long results may be stored, and bill beyond a small monthly allowance.

## Decision

`scripts/build_places.py` builds a small SQLite full-text index from the latest
[Overture Maps](https://docs.overturemaps.org/guides/places) release. It runs in the deploy
workflow, is cached for a month and ships inside the API image. It is never committed.

- **Content:** travel-related categories and towns in Lebanon, with a confidence of 0.6 or more.
  Names, positions and short addresses only: no phone numbers, emails or websites.
- **Licence:** Foursquare-sourced records are left out, so the data is CDLA Permissive 2.0 or CC0.
  Results that use it credit the Overture Maps Foundation.
- **Lookup order for trip planning:** local index, then OpenStreetMap, then Wikidata. Only
  destinations the index covers use it.
- **Matching:** the index returns every place sharing a word, so it must pass a stricter name check
  (`closely_matches`). A miss falls through to OpenStreetMap rather than accepting a weak match.
- **Add a place:** local matches come first, followed by nearby online results.

## Consequences

Most lookups in Lebanon are instant and do not use the online rate limits. Adding another country
means adding it to the build and measuring the size of the index first.
