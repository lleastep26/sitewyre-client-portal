# Go-live checklist (post-env wrap)

Production URL: **https://sitewyre-client-portal.vercel.app**

## 1. Vercel Deployment Protection — DONE
SSO / Vercel Authentication disabled. Public APIs reachable without Vercel login.

## 2. Production deploy — DONE
- Aliased to `https://sitewyre-client-portal.vercel.app`
- `NEXT_PUBLIC_APP_URL` set to that URL

Stripe webhook (`we_1UW1Kt…`, Sitewyre Client Portal) →  
`https://sitewyre-client-portal.vercel.app/api/stripe/webhook`

## 3. Supabase Auth redirect URLs — DONE
Site URL + localhost/prod `/auth/callback`. Email + Phone providers enabled.

## 4. Dual-write leads — LIVE
**Twillo workflow** (`site-lead`): systems POST kept + **Portal Dual-Write Leads**.

## 4b. Dual-write reviews — LIVE
**Review Submitted workflow** (`review-submitted`): systems POST kept + **Portal Dual-Write Reviews**.

## 5. Smoke tests — DONE
Health, leads/reviews validation, public settings, Stripe webhook endpoint present.

## 6. Phase 1 monitoring — IN PROGRESS (ops only)
See [phase1-dual-write-monitor.md](./phase1-dual-write-monitor.md) (gate ~2026-11-12).  
Engineering wrap: [phase1-wrap-review.md](./phase1-wrap-review.md).

## 7. Auth smoke — DONE
Magic link confirmed working for owner membership (`lleastep26@gmail.com`).  
SMS OTP optional for crew.

## 8. Token hygiene — MANUAL
- [ ] Revoke Supabase PATs from chat if still listed  
- [ ] Revoke n8n API key if still listed (previously returned Unauthorized)

## STOP
Do **not** start Phase 2 or cut over client `js/main.js` until the dual-write monitoring gate passes.
