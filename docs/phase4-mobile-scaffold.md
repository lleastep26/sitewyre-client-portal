# Phase 4 — Expo mobile scaffold + ingest/RLS harden

**Status:** Product wrap complete — see [phase4-wrap.md](./phase4-wrap.md)

## What landed

| Item | Behavior |
|------|----------|
| **Turnstile** | `/api/leads` + `/api/reviews/rating` verify when `TURNSTILE_SECRET_KEY` is set; skipped otherwise (n8n dual-write safe) |
| **Crew RLS** | Migration `0005_crew_rls_tighten.sql` — crew writes jobs/appointments/inbox; quotes/invoices/settings-like tables owner/office only |
| **Expo app** | `apps/mobile` — login + crew today against shared Supabase |
| **Owner mobile** | Owner/office: Leads + Inbox (SMS reply) + Today; crew stays Today-only |
| **Realtime** | Mobile Leads + Inbox subscribe to `postgres_changes` (migration `0008`) |
| **Deep link auth** | Scheme `sitewyre://auth/callback` for magic links |

## Apply

1. Supabase SQL: `0005_crew_rls_tighten.sql`, `0008_realtime_leads_messages.sql`
2. Auth redirect: `sitewyre://auth/callback`
3. Optional: Turnstile + VAPID on Vercel
4. `cd apps/mobile && npm install && npx expo start`

## Guardrails (post-MVP)

- Store submission, Google / n8n cutover, Terminal tap-to-pay — see [phase4-wrap.md](./phase4-wrap.md)
