# Automations toggles + Expo crew checklist/photos

**Status:** Shipped (code) — apply `0006_client_automations.sql`

## What landed

| Item | Behavior |
|------|----------|
| **Automation toggles** | `/automations` on/off per workflow; optional SMS templates; Inngest + job SMS respect `enabled` |
| **Missed-call text-back** | Workflow **9** — toggle + `{{business_name}}` template; 30s delay + quiet hours (was hardcoded) |
| **Expo crew** | Checklist toggles, camera photo → `job-photos`, Start route / Complete |
| **Expo owner** | Role-based shell: Leads + Inbox lists (read-only) + Today |

## Apply

1. Supabase SQL: `supabase/migrations/0006_client_automations.sql`
2. `cd apps/mobile && npm install && npx expo start`
