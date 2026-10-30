# Sitewyre Portal — native apps (Phase 4)

Expo app sharing the same portal APIs.

## Planned screens
- Login (magic link / SMS OTP via Supabase Auth)
- Crew today / job detail / checklist / photos
- Owner inbox + leads
- Tap-to-pay (Stripe Terminal) after Connect

## Bootstrap
```bash
npx create-expo-app@latest sitewyre-portal-mobile -t expo-template-blank-typescript
```

Point `EXPO_PUBLIC_SUPABASE_URL` / anon key at the existing Sitewyre Supabase project.
Use the same `memberships` roles; crew mode mirrors `/crew`.
