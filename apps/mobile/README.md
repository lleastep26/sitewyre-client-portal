# Sitewyre Portal — native apps (Phase 4)

Expo TypeScript app sharing the Sitewyre Supabase project.

**Phase 4 product MVP:** complete — see [docs/phase4-wrap.md](../../docs/phase4-wrap.md).

## Screens

- Login — magic link (`sitewyre://auth/callback`) or phone OTP
- **Owner / office** — Leads (Call / Reply SMS + Realtime), Inbox (SMS reply + Realtime), Today
- **Crew** — Today: checklist, photos, Start route / Complete, Maps

## Setup

```bash
cd apps/mobile
cp .env.example .env
npm install
npx expo start
```

```
EXPO_PUBLIC_SUPABASE_URL=
EXPO_PUBLIC_SUPABASE_ANON_KEY=
EXPO_PUBLIC_APP_URL=https://sitewyre-client-portal.vercel.app
```

Add Supabase Auth redirect URL: `sitewyre://auth/callback` (plus Expo Go URL if testing there).

Apply migration `0008_realtime_leads_messages.sql` for live Inbox/Leads updates.

## Post–Phase 4

- Tap-to-pay (Stripe Terminal) after Connect
- Store submission (P4-T5)
