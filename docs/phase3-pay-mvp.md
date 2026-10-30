# Phase 3 pay UI (Payment Element MVP)

**Status:** Shipped (code) — pilot with Stripe test mode + Connect  
**Out of scope:** Connect Accounts v2 rewrite, platform fees, SaaS subscription billing, Google / dual-write cutover

## What shipped

| Surface | Behavior |
|---------|----------|
| `/pay/[token]` | Embeds Stripe Payment Element when Connect is ready and balance remains. |
| PaymentIntent reuse | Reuses an open PI when amount still matches; otherwise creates a new one. |
| Webhook | Existing `payment_intent.succeeded` marks invoice paid/partial via `metadata.invoice_id`. |
| Staff invoices | “Open pay page” link still uses `/pay/{public_token}`. |

Destination charges use `transfer_data.destination` + `application_fee_amount: 0` (unchanged).

## Env

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET` (portal webhook already on prod)
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`

## Pilot path

1. Settings → Connect Stripe (test mode OK).  
2. Invoices → create invoice with a balance.  
3. Open pay page (`Open pay page` or `/pay/{token}`).  
4. Pay with test card `4242 4242 4242 4242`.  
5. Land on `?paid=1`; confirm invoice status after webhook.

## Guardrails

- n8n dual-write / `js/main.js` cutover unchanged.  
- Express Connect onboarding left as-is; Accounts v2 is a later follow-up.
