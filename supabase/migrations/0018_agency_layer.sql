-- Block 1: Agency layer.
-- Additive only — extends is_member/member_role rather than replacing
-- any existing policy, so every table built on those two functions
-- (leads, reviews, saved_replies, invoices, etc.) picks up agency
-- scoping for free.

create table if not exists public.agencies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.agencies enable row level security;

-- Fixed id so application code can reference "the Sitewyre agency"
-- without a name lookup. Every client created before this block
-- belongs here.
insert into public.agencies (id, name)
values ('b39e554f-05e0-488f-8654-1ae3db73f15a', 'Sitewyre')
on conflict (id) do nothing;

alter table public.clients
  add column if not exists agency_id uuid references public.agencies (id);

update public.clients
set agency_id = 'b39e554f-05e0-488f-8654-1ae3db73f15a'
where agency_id is null;

alter table public.clients
  alter column agency_id set not null;

create index if not exists clients_agency_id_idx on public.clients (agency_id);

-- Agency-level role, separate from the per-client memberships table:
-- an agency_admin's permission is agency-wide, not scoped to one
-- client_id, so it doesn't fit memberships' row shape.
create table if not exists public.agency_memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  agency_id uuid not null references public.agencies (id) on delete cascade,
  role text not null check (role = 'agency_admin'),
  created_at timestamptz not null default now(),
  unique (user_id, agency_id)
);

create index if not exists agency_memberships_user_id_idx on public.agency_memberships (user_id);
create index if not exists agency_memberships_agency_id_idx on public.agency_memberships (agency_id);

alter table public.agency_memberships enable row level security;

drop policy if exists "members read own agency" on public.agencies;
create policy "members read own agency"
on public.agencies
for select
to authenticated
using (
  public.is_sitewyre_admin()
  or exists (
    select 1 from public.agency_memberships am
    where am.user_id = auth.uid() and am.agency_id = agencies.id
  )
);

drop policy if exists "sitewyre_admin manages agencies" on public.agencies;
create policy "sitewyre_admin manages agencies"
on public.agencies
for all
to authenticated
using (public.is_sitewyre_admin())
with check (public.is_sitewyre_admin());

drop policy if exists "members read own agency_memberships" on public.agency_memberships;
create policy "members read own agency_memberships"
on public.agency_memberships
for select
to authenticated
using (public.is_sitewyre_admin() or user_id = auth.uid());

drop policy if exists "sitewyre_admin manages agency_memberships" on public.agency_memberships;
create policy "sitewyre_admin manages agency_memberships"
on public.agency_memberships
for all
to authenticated
using (public.is_sitewyre_admin())
with check (public.is_sitewyre_admin());

-- Extend the two shared RLS helpers so an agency_admin is treated as an
-- owner-level member of every client in their own agency. This is the
-- one change that makes agency scoping apply to every existing table's
-- policies without touching them individually.
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
    )
    or exists (
      select 1
      from public.agency_memberships am
      join public.clients c on c.agency_id = am.agency_id
      where am.user_id = auth.uid()
        and c.id = p_client_id
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
    when exists (
      select 1
      from public.agency_memberships am
      join public.clients c on c.agency_id = am.agency_id
      where am.user_id = auth.uid()
        and c.id = p_client_id
    ) then 'owner'
    else (
      select m.role
      from public.memberships m
      where m.user_id = auth.uid()
        and m.client_id = p_client_id
      limit 1
    )
  end;
$$;
