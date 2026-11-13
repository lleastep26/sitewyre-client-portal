-- Rollback for 0018_agency_layer.sql.
-- Run this manually in Supabase Studio if Block 1 needs to be undone.
-- Restores is_member/member_role to their pre-0018 definitions (copied
-- verbatim from 0002_portal_foundation.sql) before dropping the new
-- tables and column, so no policy is ever left referencing something
-- that's about to be dropped.

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

drop policy if exists "sitewyre_admin manages agency_memberships" on public.agency_memberships;
drop policy if exists "members read own agency_memberships" on public.agency_memberships;
drop policy if exists "sitewyre_admin manages agencies" on public.agencies;
drop policy if exists "members read own agency" on public.agencies;

drop table if exists public.agency_memberships;

alter table public.clients
  alter column agency_id drop not null;

drop index if exists public.clients_agency_id_idx;

alter table public.clients
  drop column if exists agency_id;

drop table if exists public.agencies;
