-- Funnels foundation: opt-out ledger, tracked review links, CSV import log,
-- plus the columns the three funnels need on existing tables.
-- Additive only. Apply after 0008. Apply in Supabase SQL editor (see docs/schema-baseline.md).

-- Existing tables: add columns funnels need, nothing removed/renamed.
alter table public.clients
  add column if not exists forward_to_phone text,
  add column if not exists google_place_id text;

alter table public.jobs
  add column if not exists job_type text;

-- Opt-out ledger. Decoupled from contacts.sms_opt_in so a number can be
-- checked before any contact row exists (e.g. mid-CSV-import), and so a
-- STOP is permanent even if the contact row is later deleted/merged.
create table if not exists public.opt_outs (
  client_id uuid not null references public.clients (id) on delete cascade,
  phone text not null,
  created_at timestamptz not null default now(),
  primary key (client_id, phone)
);

alter table public.opt_outs enable row level security;

drop policy if exists "members read opt_outs" on public.opt_outs;
create policy "members read opt_outs"
  on public.opt_outs for select to authenticated
  using (public.is_member(client_id));

drop policy if exists "owners write opt_outs" on public.opt_outs;
create policy "owners write opt_outs"
  on public.opt_outs for all to authenticated
  using (
    public.is_sitewyre_admin()
    or public.member_role(client_id) in ('owner', 'office')
  )
  with check (
    public.is_sitewyre_admin()
    or public.member_role(client_id) in ('owner', 'office')
  );

-- Short tracked review links (/r/[token]) so a review-request drip can
-- cancel its remaining steps once the customer clicks through.
create table if not exists public.review_links (
  token text primary key default encode(gen_random_bytes(6), 'hex'),
  client_id uuid not null references public.clients (id) on delete cascade,
  contact_id uuid references public.contacts (id) on delete set null,
  funnel_run_id uuid,
  created_at timestamptz not null default now(),
  clicked_at timestamptz
);

create index if not exists review_links_contact_idx
  on public.review_links (contact_id);

alter table public.review_links enable row level security;

drop policy if exists "members read review_links" on public.review_links;
create policy "members read review_links"
  on public.review_links for select to authenticated
  using (public.is_member(client_id));

drop policy if exists "owners write review_links" on public.review_links;
create policy "owners write review_links"
  on public.review_links for all to authenticated
  using (
    public.is_sitewyre_admin()
    or public.member_role(client_id) in ('owner', 'office')
  )
  with check (
    public.is_sitewyre_admin()
    or public.member_role(client_id) in ('owner', 'office')
  );

-- CSV past-customer import log (onboarding review blast).
create table if not exists public.imports (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  file_name text not null,
  total_rows integer not null default 0,
  valid_rows integer not null default 0,
  skipped_rows integer not null default 0,
  consent_confirmed_by uuid references auth.users (id) on delete set null,
  consent_confirmed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.imports enable row level security;

drop policy if exists "members read imports" on public.imports;
create policy "members read imports"
  on public.imports for select to authenticated
  using (public.is_member(client_id));

drop policy if exists "owners write imports" on public.imports;
create policy "owners write imports"
  on public.imports for all to authenticated
  using (
    public.is_sitewyre_admin()
    or public.member_role(client_id) in ('owner', 'office')
  )
  with check (
    public.is_sitewyre_admin()
    or public.member_role(client_id) in ('owner', 'office')
  );
