# Sitewyre Portal — native apps (Phase 4)

Expo TypeScript scaffold sharing the Sitewyre Supabase project (same `memberships` / `jobs` as the web portal).

## Screens (MVP)

- Login — magic link email or phone OTP (Supabase Auth)
- Crew today — assigned jobs for today, Maps link, Start route / Complete

## Setup

```bash
cd apps/mobile
cp .env.example .env   # if present, or create .env
npm install
npx expo start
```

Env:

```
EXPO_PUBLIC_SUPABASE_URL=
EXPO_PUBLIC_SUPABASE_ANON_KEY=
```

Use the same Auth redirect / phone providers as the web portal. Add Supabase Auth redirect URLs for Expo (`exp://…`) as needed.

## Later

- Job checklist / photos upload
- Owner inbox + leads
- Tap-to-pay (Stripe Terminal) after Connect
- Store submission (P4-T5)
