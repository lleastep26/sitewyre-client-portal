# External cutover (n8n + client sites)

Do **not** change `sitewyre-systems` in this repo. Apply these outside.

## n8n — Site Lead webhook
Today: SMS alerts + `POST https://sitewyre-systems.vercel.app/api/leads`

Add parallel node:
- `POST https://<portal-domain>/api/leads`
- Body: existing fields + `site_key` when available
- Keep systems POST until Phase 1 gate (2 weeks zero missed leads)

## n8n — Review webhook
Add parallel `POST https://<portal-domain>/api/reviews/rating`

## n8n — Onboarding
After website project creation, call:
```
POST /api/internal/accounts
Authorization: Bearer $INTERNAL_API_SECRET
{
  "business_name": "...",
  "trade": "plumbing",
  "phone": "+1...",
  "email": "owner@...",
  "domain": "example.com",
  "live_site_url": "https://example.com",
  "area_code": "615",
  "brand_colors": { "primary": "#..." }
}
```
Store returned `site_key` on the client site / CRM record.

## Client site template `js/main.js`
1. Keep n8n webhooks during dual-write.
2. Later switch `LEAD_WEBHOOK_URL` / `REVIEW_WEBHOOK_URL` to portal APIs **or** keep n8n and only dual-write from n8n.
3. Add hidden `#site-key` (or query `/api/public/settings?domain=`) for `google_review_url`.
4. Include contact email in lead payload.
5. Add SMS consent checkbox text + timestamp when ready for A2P.

## sitewyre-systems /portal
Leave running. After Phase 1 gate, redirect portal users to the new domain.

## Dual-write test (safe)
See [dual-write-checklist.md](./dual-write-checklist.md) and `scripts/test-dual-write.mjs`.
Do **not** edit the live Site Lead / Review n8n workflows until a duplicated TEST workflow succeeds.
