-- Block 5: Calendar connectors.

create table if not exists public.calendar_connections (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  provider text not null check (provider in ('google', 'outlook')),
  access_token_encrypted text not null,
  refresh_token_encrypted text not null,
  expires_at timestamptz not null,
  calendar_id text not null default 'primary',
  connected_by_user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz default now(),
  unique (client_id)
);

alter table public.calendar_connections enable row level security;

drop policy if exists "members read calendar_connections" on public.calendar_connections;
create policy "members read calendar_connections"
  on public.calendar_connections for select to authenticated
  using (public.is_member(client_id));

-- Same owner/sitewyre_admin-only write restriction as client_faqs —
-- connecting/disconnecting a calendar is an account-level setting, not a
-- day-to-day office/crew task.
drop policy if exists "owners write calendar_connections" on public.calendar_connections;
create policy "owners write calendar_connections"
  on public.calendar_connections for all to authenticated
  using (public.is_sitewyre_admin() or public.member_role(client_id) = 'owner')
  with check (public.is_sitewyre_admin() or public.member_role(client_id) = 'owner');

alter table public.appointments
  add column if not exists external_event_id text,
  add column if not exists external_calendar_provider text;
