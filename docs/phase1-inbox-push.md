# Inbox saved replies + PWA push

**Status:** Shipped (code) — apply `0007_saved_replies.sql`; set VAPID env for push

## What landed

| Item | Behavior |
|------|----------|
| **Saved replies** | Inbox chips with `{{first_name}}` / `{{business_name}}` / `{{booking_link}}` / `{{review_link}}`; add / right-click delete |
| **PWA push** | Registers SW; push on new lead, inbound SMS/email, public/staff bookings when VAPID configured |
| **Reply C** | Inbound SMS `C` / `CONFIRM` / `YES` confirms the contact's next upcoming appointment |

## Env (optional push)

```
NEXT_PUBLIC_VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=mailto:you@example.com
```

Generate with `npx web-push generate-vapid-keys`. Soft-skips when unset.
