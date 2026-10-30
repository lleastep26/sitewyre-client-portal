# Automations toggles + Expo crew checklist/photos

**Status:** Shipped (code) — apply `0006_client_automations.sql` · Phase 4 wrap: [phase4-wrap.md](./phase4-wrap.md)

## What landed

| Item | Behavior |
|------|----------|
| **Automation toggles** | `/automations` on/off per workflow; optional SMS templates; Inngest + job SMS respect `enabled` |
| **Templates 3/4/7** | Quote, appointment confirm, and invoice reminders editable (`{{quote_number}}` / `{{when}}` / `{{amount}}` + `{{link}}`) |
| **Missed-call text-back** | Workflow **9** — toggle + `{{business_name}}` template; 30s delay + quiet hours (was hardcoded) |
| **Expo crew** | Checklist toggles, camera photo → `job-photos`, Start route / Complete |
| **Expo owner** | Role-based shell: Leads + Inbox + Today; Inbox SMS reply via `POST /api/inbox/send` (Bearer JWT) |

## Apply

1. Supabase SQL: `supabase/migrations/0006_client_automations.sql`
2. `cd apps/mobile && npm install && npx expo start`
