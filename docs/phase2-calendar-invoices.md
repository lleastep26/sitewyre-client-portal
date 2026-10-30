# Phase 2/3 polish — invoice reminders, day calendar, help status

**Status:** Shipped (code)

## What landed

| Item | Behavior |
|------|----------|
| Invoice reminders | On send → Inngest 3d + 7d follow-ups if still unpaid (email + SMS); skips paid/void |
| Day / crew calendar | `/calendar?view=day` hour × assignee lanes; week view unchanged |
| Help status | `/help` system checks: health, Twilio, Connect, booking link |

## Guardrails

- No Google Calendar sync, n8n cutover, or live charge requirement  
