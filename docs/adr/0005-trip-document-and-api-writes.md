# 5. One document per trip; the browser reads through the API and never writes to Firestore

- Status: Accepted
- Date: 2026-11-10

## Context

The brief lists users, trips, days, stops, packing lists, checklists and share tokens as data.
Editing is drag-and-drop with undo/redo: one gesture can touch two days at once, and an undo must
restore exactly the previous state.

## Decision

- **Days and stops live inside the trip document** (`users/{uid}/trips/{tripId}`). A two-week
  trip is a few tens of kilobytes, far below Firestore's 1 MiB limit. Every edit is one atomic
  write of the itinerary, which matches the undo stack (one snapshot per step) exactly.
- **Packing list and documents checklist are separate documents** under the trip
  (`extras/packing`, `extras/documents`): they change often, independently of the itinerary.
- **Optimistic concurrency:** each trip has a `version`. `PUT /api/trips/{id}` carries the base
  version and is rejected with 409 if another tab saved first; the UI offers a reload.
- **All writes go through the API**, where Pydantic validates them (ids, sizes, destination per
  day, unique stops). Firestore rules allow owners to read their own `users/{uid}` tree and deny
  every client write. This is stricter than the brief's "users read/write only their own trips".
- **Share tokens are server-only** (`shares/{token}`), so links cannot be listed or guessed
  through Firestore. Revoking deletes the token; the public endpoint returns the map and
  itinerary only, never notes, budget overrides, packing list or documents.

## Consequences

- No Firestore SDK in the browser bundle; one data path (the API) to test and secure.
- No real-time sync between two open tabs; the version check makes conflicts explicit instead.
