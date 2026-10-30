# Inbox saved replies + PWA push

**Status:** Shipped (code) — apply `0007_saved_replies.sql`; set VAPID env for push

## What landed

| Item | Behavior |
|------|----------|
| **Saved replies** | Inbox chips with `{{first_name}}` / `{{business_name}}`; add / right-click delete |
| **PWA push** | Registers SW, asks permission, stores subscription; new-lead Inngest sends web push when VAPID configured |

## Env (optional push)

```
NEXT_PUBLIC_VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=mailto:you@example.com
```

Generate with `npx web-push generate-vapid-keys`. Soft-skips when unset.
