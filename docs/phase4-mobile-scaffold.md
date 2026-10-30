# Phase 4 — Expo mobile scaffold + ingest/RLS harden

**Status:** Shipped (code) — apply RLS migration in Supabase

## What landed

| Item | Behavior |
|------|----------|
| **Turnstile** | `/api/leads` + `/api/reviews/rating` verify when `TURNSTILE_SECRET_KEY` is set; skipped otherwise (n8n dual-write safe) |
| **Crew RLS** | Migration `0005_crew_rls_tighten.sql` — crew writes jobs/appointments/inbox; quotes/invoices/settings-like tables owner/office only |
| **Expo app** | `apps/mobile` — login + crew today against shared Supabase |

## Apply

1. Supabase SQL: `supabase/migrations/0005_crew_rls_tighten.sql`
2. Optional: set `TURNSTILE_SECRET_KEY` + `NEXT_PUBLIC_TURNSTILE_SITE_KEY` on Vercel when site widgets are ready
3. `cd apps/mobile && npm install && npx expo start`

## Guardrails

- No store submission yet  
- No Google / n8n cutover  
- No Terminal tap-to-pay yet  
