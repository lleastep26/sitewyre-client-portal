# Phase 1 wrap review (stop before Phase 2)

**Date:** 2026-10-30  
**Prod:** https://sitewyre-client-portal.vercel.app  
**Repo:** https://github.com/lleastep26/sitewyre-client-portal (`main`)

## Status

| Area | Status |
|------|--------|
| Phase 0 build (scaffold, schema, RLS, auth, public APIs) | **Complete** |
| Phase 1 CRM surfaces (leads, inbox, settings, jobs, quotes, invoices, reports, PWA shell) | **Complete** (see inventory) |
| Prod deploy + env + Auth URLs + Stripe webhook | **Complete** |
| Magic-link login | **Confirmed working** (owner `lleastep26@gmail.com`) |
| Lead dual-write (n8n → systems + portal) | **Live** |
| Review dual-write (n8n → systems + portal) | **Live** |
| Phase 1 **reliability gate** (2 weeks zero misses) | **In progress** (~through 2026-11-12) |
| Phase 2 scheduling MVP (week + slots + reminders; no Google / no cutover) | **Shipped in parallel** — see [phase2-scheduling-mvp.md](./phase2-scheduling-mvp.md) |

Phase 1 **engineering** is done. What remains for cutover is **operational dual-write monitoring**. A scoped Phase 2 scheduling MVP may proceed in parallel; it must not touch n8n dual-write or live site webhooks.

## What’s live (inventory)

**App:** home (incl. 15m speed-to-lead Needs reply), leads board, inbox (SMS/email/notes), calendar (list + create), jobs, quotes (+ public `/q/[token]`), invoices, reports, settings (incl. Connect button), help/more, support tickets, crew today’s jobs, PWA register.

**Public APIs:** `/api/leads`, `/api/reviews/rating`, `/api/public/settings`, `/api/health`, Stripe/Twilio/Inngest webhooks, internal accounts.

**Auth:** browser magic link + phone OTP UI; memberships for Exclusive Cleaning (`lleastep26@gmail.com`) and Eastep Mechanical.

**n8n:** Twillo `site-lead` + Review Submitted `review-submitted` both POST portal in parallel with systems; portal failures do not block SMS/systems.

## Verified this wrap

- `/api/health` → ok  
- `/login` → 200  
- Leads/reviews APIs validate payloads (400 on bad body)  
- Public settings resolves by `site_key`  
- Stripe portal webhook endpoint enabled at prod URL  

## Gate until monitoring passes (~Nov 12)

Do **not** (cutover):

- Remove systems POSTs from n8n  
- Point client `js/main.js` lead/review webhooks only at the portal  
- Retire sitewyre-systems `/portal`  
- Treat Google Calendar sync or site cutover as unblocked by this wrap  

OK in parallel:

- Phase 2 scheduling MVP (staff week calendar, public slots, reminders) — no dual-write or `js/main.js` changes  

Do (monitoring):

- Daily: n8n Executions → Portal Dual-Write nodes → `{ ok: true }`  
- Log any systems-ok / portal-fail pairs  
- See [phase1-dual-write-monitor.md](./phase1-dual-write-monitor.md)

## Known Phase 1 risks (fix, don’t block monitoring)

1. Public ingest is open (CORS `*`); Turnstile fields unused — prefer `site_key` in n8n payloads.  
2. Missing Twilio/Resend/Inngest env → silent fake adapters (confirm env on Vercel for pilot clients).  
3. `api/sendgrid/inbound` must not fall back to “first client” (hardened in wrap).  
4. CRM RLS in `0003` lets any member (incl. crew) write many tables — tighten later.  
5. Admin with no membership picks arbitrary first client — OK for now with 2 clients.  
6. Pay page Payment Element shipped (Phase 3 MVP) — see [phase3-pay-mvp.md](./phase3-pay-mvp.md); Connect Accounts v2 / fees later.  
7. Calendar week view + slots MVP shipped; day/crew layouts and Google sync still later.  
8. Revoke any leftover Supabase/n8n tokens from chat if still active.

## Phase 1 follow-ups (still not Phase 2)

1. Run the ~2-week dual-write monitor to completion.  
2. One real lead E2E check: form → n8n → systems + portal row + SMS if Twilio live.  
3. Optional: Turnstile on public ingest.  
4. Optional: tighten crew RLS write scope.  
5. Token hygiene checklist.

## Resume later (cutover / deeper Phase 2)

1. Confirm gate passed (or decide to keep n8n dual-write permanently).  
2. Only then plan live site webhook cutover and optional Google Calendar.  
3. Scheduling MVP details: [phase2-scheduling-mvp.md](./phase2-scheduling-mvp.md).  
