-- Business Profile tab (Settings): fields with no existing column, plus a
-- public storage bucket for the business logo. Additive only.
--
-- business_name, owner_name, phone, domain, trade, timezone already exist
-- and are reused, not duplicated, by the new tab.

alter table public.clients
  add column if not exists legal_business_name text,
  add column if not exists business_email text,
  add column if not exists website text,
  add column if not exists address_line1 text,
  add column if not exists city text,
  add column if not exists state text,
  add column if not exists postal_code text,
  add column if not exists country text not null default 'US',
  add column if not exists logo_url text;

insert into storage.buckets (id, name, public)
values ('business-logos', 'business-logos', true)
on conflict (id) do update set public = excluded.public;

-- Public read; writes go through the portal service role / server actions.
drop policy if exists "business_logos_public_read" on storage.objects;
create policy "business_logos_public_read"
  on storage.objects for select
  using (bucket_id = 'business-logos');
