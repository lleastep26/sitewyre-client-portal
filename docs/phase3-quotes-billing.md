# Phase 3 continuation — quotes deposit, reports email, billing features

**Status:** Shipped (code)  
**Out of scope:** Google Business / QuickBooks, live Connect fee take, SaaS subscription billing meters

## What landed

| Ticket | Behavior |
|--------|----------|
| **P2-T7 remainder** | Quote follow-ups at 3d + 7d after send; rebooking nudge 14d after job complete |
| **P3-T1 polish** | Public `/q/[token]` requires signer name; creates 20% deposit invoice + pay link |
| **P3-T4** | Existing CSV + monthly snapshot SMS cron (`0 14 1 * *`) |
| **P3-T6** | Settings Billing lists `plan_features`; `hasFeature` gates recurring jobs |

## Guardrails

- Dual-write / `js/main.js` cutover unchanged  
- Google Calendar / GBP / QB still deferred  
