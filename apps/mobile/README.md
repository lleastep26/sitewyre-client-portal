# Sitewyre Portal — native apps (Phase 4)

Expo TypeScript scaffold sharing the Sitewyre Supabase project (same `memberships` / `jobs` / `leads` / `messages` as the web portal).

## Screens (MVP)

- Login — magic link email or phone OTP (Supabase Auth)
- **Owner / office** — tabs: Leads, Inbox (SMS reply via portal API), Today
- **Crew** — Today only: checklist, camera photos, Start route / Complete, Maps

## Setup

```bash
cd apps/mobile
cp .env.example .env
npm install
npx expo start
```

Env:

```
EXPO_PUBLIC_SUPABASE_URL=
EXPO_PUBLIC_SUPABASE_ANON_KEY=
EXPO_PUBLIC_APP_URL=https://sitewyre-client-portal.vercel.app
```

Use the same Auth redirect / phone providers as the web portal. Add Supabase Auth redirect URLs for Expo (`exp://…`) as needed.

Inbox SMS uses `POST /api/inbox/send` with the Supabase access token (`Authorization: Bearer …`).

## Later

- Tap-to-pay (Stripe Terminal) after Connect
- Store submission (P4-T5)
