# Phase 2 scheduling MVP (week + slots + reminders)

**Status:** Shipped (code) — pilot on prod; dual-write monitoring still in parallel  
**Out of scope here:** Google Calendar OAuth/sync, n8n / `js/main.js` cutover, Stripe pay UI

## What shipped

| Surface | Behavior |
|---------|----------|
| Settings → Booking hours | CRUD weekly `availability` (weekday, start/end, buffer, min notice). Seeds Mon–Fri 9–5 on first open. |
| Settings → Bookable services | Toggle `bookable_online` on trade-preset services. |
| Slot engine | `src/lib/scheduling/slots.ts` — 30-minute grid from availability − busy (± buffer) − min notice. |
| Public slots API | `GET /api/public/slots?site_key=&service_id=&from=&to=` |
| Public `/book/[siteKey]` | Steps: service → day → slot chips → contact → confirm. Success `?booked=1`. Re-checks conflict on submit. |
| Staff `/calendar` | Mon–Sun week grid; click empty hour to create; click block to reschedule / status / assignee. |
| Reminders | Confirmation SMS now + delayed ~24h-before via Inngest `portal/appointment.reminder` when Twilio + phone present; soft-fail otherwise. |

## Pilot path

1. Open **Settings** → confirm hours + which services show online.  
2. Open **Calendar** → verify week grid; create a test appointment.  
3. Open `/book/{site_key}` → book a slot; confirm `?booked=1` and appointment row.  
4. If Twilio is live, confirm SMS; if not, expect silent no-op (same as leads).

## Dual-write / cutover (unchanged)

- n8n dual-write to systems + portal stays as-is.  
- Do **not** edit live Site Lead/Review cutover or client `js/main.js` webhook URLs.  
- Phase 1 reliability gate (~through 2026-11-12) continues in parallel; this MVP does not depend on removing systems POSTs.

## Not in this slice

- Google Calendar sync  
- Day/crew multi-resource layouts beyond week + assignee  
- Workflow builder expansion  
- Phase 3 money flows  

**Follow-on (P2-T4–T7):** [phase2-jobs-automations.md](./phase2-jobs-automations.md) — crew photos, recurrence, quiet hours, automations run log.
