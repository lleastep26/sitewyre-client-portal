-- Rollback for 0009_funnels_foundation.sql.
-- Safe to run only if the new tables/columns have no data you need yet —
-- this discards opt_outs/review_links/imports rows and the two new
-- clients/jobs columns along with the schema.

drop table if exists public.imports;
drop table if exists public.review_links;
drop table if exists public.opt_outs;

alter table public.jobs drop column if exists job_type;
alter table public.clients drop column if exists google_place_id;
alter table public.clients drop column if exists forward_to_phone;
