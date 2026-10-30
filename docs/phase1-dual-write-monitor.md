# Phase 1 gate — dual-write monitoring (2 weeks)

**Start date:** 2026-10-29  
**Gate ends:** ~2026-11-12  
**Pass criteria:** Every production site lead and review that hits n8n also lands in the portal (zero unexplained misses).

## What’s live
| Path | n8n workflow | Systems | Portal |
|------|--------------|---------|--------|
| `webhook/site-lead` | Twillo workflow (active) | `sitewyre-systems…/api/leads` | `sitewyre-client-portal…/api/leads` |
| `webhook/review-submitted` | Review Submitted workflow (active) | `sitewyresystems.com/api/reviews` | `…/api/reviews/rating` |

Portal nodes use `$json.body.*` / `$('review-submitted').item.json.body.*` and **continue on fail** so a portal error does not drop SMS/systems.

## Daily check (2–5 min)
1. Open n8n → **Executions** for Twillo + Review Submitted.
2. For each successful run, open **Portal Dual-Write Leads/Reviews** — expect `{ ok: true, lead_id|review_id }`.
3. If portal node shows an error but systems succeeded → log it (date, execution id, error). Fix before declaring gate passed.
4. Spot-check Supabase `leads` / `reviews` for a matching `created_at` when unsure.

## Weekly rollup
- Count executions vs portal `{ok:true}` responses.
- Note any payload shape changes from client `js/main.js` (missing `domain` / `business_name` / `site_key`).

## After gate passes
Only then consider:
- Pointing client `LEAD_WEBHOOK_URL` / `REVIEW_WEBHOOK_URL` at portal APIs, **or**
- Keeping n8n forever as the dual-writer (valid choice).

Do **not** remove systems POSTs until the gate passes and you intentionally cut over.

## Housekeeping (one-time)
- [ ] Revoke Supabase PATs pasted in chat  
- [ ] Revoke n8n API key pasted in chat  
- [x] Stripe portal webhook URL → `https://sitewyre-client-portal.vercel.app/api/stripe/webhook`  
- [ ] Prod magic-link login smoke (owner email)  
- [ ] Prod SMS OTP smoke (if crew phone login is required)  
