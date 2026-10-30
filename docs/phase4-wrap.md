# Phase 4 wrap — product complete

**Date:** 2026-10-30  
**Prod:** https://sitewyre-client-portal.vercel.app  
**Repo:** `main`

## Status

| Area | Status |
|------|--------|
| Expo crew Today (checklist, photos, route/complete) | **Complete** |
| Expo owner Leads / Inbox / Today + SMS reply | **Complete** |
| Magic-link deep link (`sitewyre://`) | **Complete** (code) |
| Realtime leads + messages on mobile | **Complete** (code) — apply `0008` |
| Turnstile + crew RLS | **Complete** (code) — apply `0005` |
| Automations toggles + templates + SLA/missed-call | **Complete** |
| Help / health flags | **Complete** |

## Apply (ops)

1. Supabase SQL: `0005_crew_rls_tighten.sql`, `0006_client_automations.sql`, `0007_saved_replies.sql`, `0008_realtime_leads_messages.sql` (if not already)
2. Auth redirect URLs: add `sitewyre://auth/callback` (and Expo Go `exp://…` if used)
3. Optional: VAPID trio on Vercel for PWA push (`NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`)

## Explicitly out of Phase 4 product wrap

- Stripe Terminal tap-to-pay  
- App Store / Play Store submission  
- Google Calendar / GBP / QuickBooks  
- Dual-write / `js/main.js` cutover (Phase 1 gate ~2026-11-12)  
- Visual workflow builder  

## Mobile setup

```bash
cd apps/mobile && cp .env.example .env && npm install && npx expo start
```
