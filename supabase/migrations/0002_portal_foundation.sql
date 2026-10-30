-- Phase 0: extend clients, memberships, audit_log, RLS helpers.
-- Additive only — never drop/rename columns used by sitewyre-systems portal.

alter table public.clients
  alter column user_id drop not null;

alter table public.clients
  add column if not exists site_key text,
  add column if not exists timezone text default 'America/Chicago',
  add column if not exists brand_colors jsonb default '{}'::jsonb,
  add column if not exists service_area text,
  add column if not exists plan text default 'contractor_299',
  add column if not exists status text default 'active',
  add column if not exists twilio_phone_number text,
  add column if not exists twilio_phone_sid text,
  add column if not exists a2p_status text default 'pending',
  add column if not exists stripe_connect_account_id text,
  add column if not exists setup_checklist jsonb default '{}'::jsonb,
  add column if not exists updated_at timestamptz default now();

create unique index if not exists clients_site_key_uidx
  on public.clients (site_key)
  where site_key is not null;

create index if not exists clients_domain_idx on public.clients (domain);

create table if not exists public.memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  role text not null check (role in ('owner', 'office', 'crew', 'sitewyre_admin')),
  created_at timestamptz not null default now(),
  unique (user_id, client_id)
);

create index if not exists memberships_client_id_idx on public.memberships (client_id);
create index if not exists memberships_user_id_idx on public.memberships (user_id);

alter table public.memberships enable row level security;

create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users (id) on delete set null,
  action text not null,
  entity text not null,
  entity_id uuid,
  client_id uuid references public.clients (id) on delete set null,
  diff jsonb,
  created_at timestamptz not null default now()
);

create index if not exists audit_log_client_id_idx on public.audit_log (client_id);
alter table public.audit_log enable row level security;

create or replace function public.is_sitewyre_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.memberships m
    where m.user_id = auth.uid()
      and m.role = 'sitewyre_admin'
  );
$$;

create or replace function public.is_member(p_client_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_sitewyre_admin()
    or exists (
      select 1
      from public.memberships m
      where m.user_id = auth.uid()
        and m.client_id = p_client_id
    )
    or exists (
      select 1
      from public.clients c
      where c.id = p_client_id
        and c.user_id = auth.uid()
    );
$$;

create or replace function public.member_role(p_client_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when public.is_sitewyre_admin() then 'sitewyre_admin'
    else (
      select m.role
      from public.memberships m
      where m.user_id = auth.uid()
        and m.client_id = p_client_id
      limit 1
    )
  end;
$$;

-- Backfill owner memberships from clients.user_id
insert into public.memberships (user_id, client_id, role)
select c.user_id, c.id, 'owner'
from public.clients c
where c.user_id is not null
on conflict (user_id, client_id) do nothing;

-- Generate site_key for existing clients missing one
update public.clients
set site_key = encode(gen_random_bytes(12), 'hex')
where site_key is null;

-- Membership-aware select policies (keep legacy owner policies too)
drop policy if exists "members can read client" on public.clients;
create policy "members can read client"
on public.clients
for select
to authenticated
using (public.is_member(id));

drop policy if exists "members can update client" on public.clients;
create policy "members can update client"
on public.clients
for update
to authenticated
using (
  public.is_sitewyre_admin()
  or public.member_role(id) in ('owner', 'office')
)
with check (
  public.is_sitewyre_admin()
  or public.member_role(id) in ('owner', 'office')
);

drop policy if exists "members can read memberships" on public.memberships;
create policy "members can read memberships"
on public.memberships
for select
to authenticated
using (public.is_member(client_id) or user_id = auth.uid());

drop policy if exists "owners manage memberships" on public.memberships;
create policy "owners manage memberships"
on public.memberships
for all
to authenticated
using (
  public.is_sitewyre_admin()
  or public.member_role(client_id) = 'owner'
)
with check (
  public.is_sitewyre_admin()
  or public.member_role(client_id) = 'owner'
);

drop policy if exists "members read leads" on public.leads;
create policy "members read leads"
on public.leads
for select
to authenticated
using (public.is_member(client_id));

drop policy if exists "members write leads" on public.leads;
create policy "members write leads"
on public.leads
for all
to authenticated
using (
  public.is_sitewyre_admin()
  or public.member_role(client_id) in ('owner', 'office')
)
with check (
  public.is_sitewyre_admin()
  or public.member_role(client_id) in ('owner', 'office')
);

drop policy if exists "members read reviews" on public.reviews;
create policy "members read reviews"
on public.reviews
for select
to authenticated
using (public.is_member(client_id));

drop policy if exists "admins read audit" on public.audit_log;
create policy "admins read audit"
on public.audit_log
for select
to authenticated
using (public.is_sitewyre_admin() or public.is_member(client_id));

drop policy if exists "authenticated insert audit" on public.audit_log;
create policy "authenticated insert audit"
on public.audit_log
for insert
to authenticated
with check (actor_id = auth.uid() or public.is_sitewyre_admin());
