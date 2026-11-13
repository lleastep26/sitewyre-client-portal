-- Block 9: Ads connection screens. Tables and status only — no live API
-- calls are made until each platform approves API access.

-- Per-client connection status reuses the existing (so far unused)
-- integrations table: one row per client per provider.
alter table public.integrations
  add column if not exists requested_at timestamptz,
  add column if not exists requested_by_user_id uuid references auth.users (id) on delete set null,
  add column if not exists connected_at timestamptz,
  add column if not exists external_account_id text;

-- Until now any team member could write to integrations (it holds
-- encrypted tokens). Reads stay open to members; writes are limited to the
-- owner and Sitewyre admins, the same rule as calendar_connections. An
-- agency admin's view-as session resolves to member_role() = 'owner'.
drop policy if exists "members write integrations" on public.integrations;
drop policy if exists "owners write integrations" on public.integrations;
create policy "owners write integrations"
  on public.integrations for all to authenticated
  using (public.is_sitewyre_admin() or public.member_role(client_id) = 'owner')
  with check (public.is_sitewyre_admin() or public.member_role(client_id) = 'owner');

-- Daily ad numbers per client per platform, filled in once API access is
-- approved.
create table if not exists public.ad_stats_daily (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  provider text not null,
  stat_date date not null,
  spend numeric(12, 2) not null default 0,
  impressions integer not null default 0,
  clicks integer not null default 0,
  leads integer not null default 0,
  created_at timestamptz not null default now(),
  unique (client_id, provider, stat_date)
);

create index if not exists ad_stats_daily_client_idx
  on public.ad_stats_daily (client_id, stat_date desc);

alter table public.ad_stats_daily enable row level security;

drop policy if exists "members read ad_stats_daily" on public.ad_stats_daily;
create policy "members read ad_stats_daily"
  on public.ad_stats_daily for select to authenticated
  using (public.is_member(client_id));

-- Maps a lead that arrived from an ad platform (a Meta lead ad, a Local
-- Services lead) to the portal lead it created, so the same platform lead
-- is never imported twice.
create table if not exists public.ad_platform_leads (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  provider text not null,
  external_lead_id text not null,
  lead_id uuid references public.leads (id) on delete set null,
  received_at timestamptz not null default now(),
  unique (client_id, provider, external_lead_id)
);

create index if not exists ad_platform_leads_client_idx
  on public.ad_platform_leads (client_id, received_at desc);

alter table public.ad_platform_leads enable row level security;

drop policy if exists "members read ad_platform_leads" on public.ad_platform_leads;
create policy "members read ad_platform_leads"
  on public.ad_platform_leads for select to authenticated
  using (public.is_member(client_id));

-- Both new tables have no member write policy on purpose: they are only
-- written by sync jobs using the service role.
