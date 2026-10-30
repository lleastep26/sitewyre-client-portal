# Go-live checklist (post-env wrap)

Production URL: **https://sitewyre-client-portal.vercel.app**

## 1. Vercel Deployment Protection — DONE
SSO / Vercel Authentication disabled for this project (`ssoProtection: null`).
Public APIs respond without login (`/api/health` → 200).

## 2. Production deploy — DONE
- Latest prod deploy READY, aliased to `https://sitewyre-client-portal.vercel.app`
- `NEXT_PUBLIC_APP_URL` set to that URL (local + Vercel production/preview)

Stripe webhook (`we_1UW1Kt…`, Sitewyre Client Portal) →  
`https://sitewyre-client-portal.vercel.app/api/stripe/webhook` (updated; secret unchanged)

## 3. Supabase Auth redirect URLs — DONE
- Site URL: `https://sitewyre-client-portal.vercel.app`
- Redirects: localhost + prod `/auth/callback`
- Email enabled; Phone enabled with Twilio SMS provider wired

## 4. Dual-write — LIVE PROMOTED
See [dual-write-checklist.md](./dual-write-checklist.md).

Site Lead: **Twillo workflow** (`IFMPDoY2T4RjTUjs`, path `site-lead`, **active**).

1. ~~Portal `/api/leads` smoke~~
2. ~~TEST copy~~ `Twillo workflow Dual-Write TEST` (`SmR4gngHLKm0FwGp`) — E2E exec `206` passed
3. ~~Live promote~~ **Portal Dual-Write Leads** added in parallel with **Save lead to Sitewyre**
   - Systems URL unchanged: `https://sitewyre-systems.vercel.app/api/leads`
   - Portal: `https://sitewyre-client-portal.vercel.app/api/leads` (`$json.body.*`, `neverError` / continue on fail)
   - Webhook fan-out: SMS + Save lead + Portal Dual-Write
4. Monitor ~2 weeks for missed portal leads before cutting client sites over to portal-only

Misplaced node removed from `SiteWyre Systems workflow copy` (wrong workflow).

## 4b. Review dual-write — LIVE PROMOTED
- TEST: **Review Submitted Dual-Write TEST** (`mFGZcK9YHk5CezOb`) — exec `208` success  
  systems `{ok:true}` + portal `{ok:true, review_id:ebef50e0-...}`
- LIVE: **Review Submitted workflow** (`8RFWidGh2Unh4lQW`, path `review-submitted`, **active**)
  - **Portal Dual-Write Reviews** → `POST https://sitewyre-client-portal.vercel.app/api/reviews/rating`
  - Parallel with systems `HTTP Request` on the `If` true branch
  - Systems URL unchanged (`sitewyresystems.com/api/reviews`)
  - Portal uses `$('review-submitted').item.json.body.*`, continue on fail

## 5. Smoke tests after prod — DONE
```bash
curl -sS https://sitewyre-client-portal.vercel.app/api/health
# {"ok":true,...}
node scripts/test-dual-write.mjs --portal https://sitewyre-client-portal.vercel.app --site-key <client_site_key>
# PORTAL /api/leads 200 { ok: true, lead_id, contact_id }
```

## 6. Phase 1 monitoring — IN PROGRESS
See [phase1-dual-write-monitor.md](./phase1-dual-write-monitor.md) (gate ~2026-11-12).

## 7. Auth smoke — MANUAL
1. Open https://sitewyre-client-portal.vercel.app/login  
2. Magic link to an owner email that has a `memberships` row  
3. Confirm redirect to `/auth/callback` then app shell  
4. Optional: SMS OTP for crew phone login  

## 8. Token hygiene — MANUAL
- [ ] Revoke Supabase access tokens created for Auth URL setup  
- [ ] Revoke n8n API key pasted in chat (if not already — API now returns Unauthorized)  
