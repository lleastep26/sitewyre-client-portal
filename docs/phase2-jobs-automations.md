# Phase 2 continuation — jobs, recurrence, quiet hours, automations

**Status:** Shipped (code) — apply storage migration for photos  
**Out of scope:** Google Calendar sync, n8n / `js/main.js` cutover, automation copy editor UI

## Tickets covered

| Ticket | Behavior |
|--------|----------|
| **P2-T4** | Crew/jobs: checklist, photo upload (`job-photos` bucket), Start route / Complete; contact phone resolved for on-my-way + review SMS |
| **P2-T5** | Job create recurrence: weekly / biweekly / monthly expanded over **90 days** |
| **P2-T6** | Appointment confirm + **24h** + **2h** reminders; quiet hours **9pm–8am** in `clients.timezone` |
| **P2-T7** | Automations 1–8 status + `/automations` run log; unanswered lead follow-up (2d); workflow logging on reminders |

## Apply migration

In Supabase SQL editor:

- `supabase/migrations/0004_job_photos_storage.sql`

Without it, photo upload returns a clear error.

## Pilot path

1. Jobs → create with optional recurrence; confirm series rows.  
2. Crew mode → checklist, add photo, Start route / Complete.  
3. Book or calendar-create an appointment → confirm/reminder events respect quiet hours.  
4. More → Automations → recent `workflow_runs`.

## Still later

- Editable templates / per-automation toggles  
- Google Calendar (P2-T8) after Phase 1 dual-write gate  
- Day/crew multi-resource calendar layouts  

**Follow-on:** [phase3-quotes-billing.md](./phase3-quotes-billing.md) — quote follow-ups, rebooking, deposit e-sign, monthly snapshot, billing features.
