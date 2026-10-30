# Schema baseline

## Source
- Existing Sitewyre Supabase project (shared with `sitewyre-systems` and `sitewyre-crm`).
- Checked in from `sitewyre-systems/supabase/schema.sql` plus live additive columns observed in CRM (`clients.user_id` nullable for staff flows).

## Existing tables (do not drop)
- `contact_requests` — marketing book-a-call
- `clients` — contractor accounts (extended by portal migrations)
- `leads` — website form leads (extended with pipeline fields)
- `reviews` — review funnel ratings
- CRM staff tables (`staff_members`, `booked_calls`, …) live in the same project; portal migrations must not conflict

## Portal migrations
1. `0001_baseline.sql` — idempotent create of core tables + legacy RLS
2. `0002_portal_foundation.sql` — `site_key`, memberships, audit_log, helpers
3. `0003_crm_core.sql` — contacts, pipeline, messages, jobs, quotes, invoices, etc.

## Apply
Run SQL files in order in Supabase Studio → SQL Editor, or via CLI against the existing project. Never create a new Supabase project.
