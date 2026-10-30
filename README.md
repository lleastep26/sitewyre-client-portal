# Sitewyre Client Portal

Contractor CRM portal for Sitewyre clients — leads, inbox, pipeline, scheduling, jobs, quotes, invoices, and reports.

- **Repo:** `sitewyre-client-portal` (separate Vercel project)
- **Database / Auth:** existing Sitewyre Supabase project (shared with `sitewyre-systems`)
- **Jobs:** Inngest
- **Stack:** Next.js App Router, TypeScript, Tailwind, shadcn-style UI

## Setup

1. Copy `.env.example` → `.env` and fill values from the existing Supabase / Twilio / Resend / Stripe / Inngest projects.
2. Apply migrations in order in Supabase SQL Editor:
   - `supabase/migrations/0001_baseline.sql`
   - `supabase/migrations/0002_portal_foundation.sql`
   - `supabase/migrations/0003_crm_core.sql`
3. Add Auth redirect URLs: `http://localhost:3000/auth/callback` and production `/auth/callback`.
4. Create a Vercel project from this repo (do not reuse the marketing site or CRM projects).

```bash
npm install
npm run dev
```

## Scripts

- `npm run dev` — local server
- `npm run build` — production build
- `npm run lint` — ESLint
- `npm run typecheck` — `tsc --noEmit`
- `npm test` — Vitest unit tests

## Docs

- [Schema baseline](docs/schema-baseline.md)
- [External cutover (n8n + sites)](docs/external-cutover.md)
- [Native apps](apps/mobile/README.md)

## Phase gates

- **Phase 0:** two test accounts cannot see each other’s data
- **Phase 1:** all current clients receive leads for 2 weeks with zero misses (dual-write)
- **Phase 2:** pilot books/schedules/completes only through the portal for 2 weeks
- **Phase 3:** quote → paid works with real Connect charges
- **Phase 4:** native apps approved in both stores
