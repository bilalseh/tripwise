# 8. PDF and calendar export, and Stripe in test mode

- Status: Accepted
- Date: 2026-11-10

## PDF

The PDF is a print-ready page (`/trips/{id}/print`) saved through the browser's "Save as PDF".
Browser PDF libraries (jsPDF, pdf-lib) do not shape Arabic text or lay out right to left without
heavy font embedding; the browser's own print engine does both correctly. The page contains the
days, addresses, estimated times, the budget summary and a map snapshot (the MapLibre canvas
captured once its tiles have loaded, with `preserveDrawingBuffer`).

## Calendar

`.ics` files are built in `shared/src/domain/ics.ts`: one event per stop at its estimated time,
floating local times (what a traveller wants), RFC 5545 escaping and 75-octet line folding.

## Billing

Stripe Checkout in **test mode only**: the API refuses any key that is not `sk_test_` or
`rk_test_`, the UI says "test mode" on the pricing page and the button, and the test card is
shown. Upgrades are confirmed two ways (the returning browser's session ID, checked with Stripe,
and a signed webhook with a 5-minute replay window), so neither is a single point of failure.
Cancelling ends the subscription immediately. Tripwise never takes payments for travel.
