-- The review_blast automation template (seeded in src/lib/automations.ts) uses
-- {{owner_name}}, but clients had no column to populate it from — only
-- business_name. Additive only.

alter table public.clients
  add column if not exists owner_name text;
