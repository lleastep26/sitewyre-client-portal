# Dual-write checklist

## Status (2026-10-29) — LIVE
Leads and reviews dual-write from n8n → systems **and** portal.

See **[phase1-dual-write-monitor.md](./phase1-dual-write-monitor.md)** for the 2-week Phase 1 gate.

| Flow | Live workflow | Portal node | Systems kept |
|------|---------------|-------------|--------------|
| Site lead | Twillo workflow (`site-lead`) | Portal Dual-Write Leads | `sitewyre-systems…/api/leads` |
| Review | Review Submitted (`review-submitted`) | Portal Dual-Write Reviews | `sitewyresystems.com/api/reviews` |

TEST copies (inactive):  
`Twillo workflow Dual-Write TEST`, `Review Submitted Dual-Write TEST`

## Already done in portal
- `POST /api/leads` accepts `site_key` (+ domain / business_name fallback)
- `POST /api/reviews/rating` mirrors systems review ingest
- Clients have `site_key` values
- Local dry-run: `scripts/test-dual-write.mjs`
- Deployment Protection off on portal; prod URL public

## Do not do yet
- Do not remove systems POSTs from n8n
- Do not point client `js/main.js` webhooks at portal until Phase 1 gate passes (~2 weeks zero misses)

## After gate
Optional cutover of `LEAD_WEBHOOK_URL` / `REVIEW_WEBHOOK_URL` — see [external-cutover.md](./external-cutover.md).
