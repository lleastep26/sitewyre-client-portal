-- Per-client automation toggles + optional SMS/email template override.
-- Apply after 0005.

create table if not exists public.client_automations (
  client_id uuid not null references public.clients (id) on delete cascade,
  trigger text not null,
  enabled boolean not null default true,
  template_body text,
  updated_at timestamptz default now(),
  primary key (client_id, trigger)
);

alter table public.client_automations enable row level security;

drop policy if exists "members read client_automations" on public.client_automations;
create policy "members read client_automations"
  on public.client_automations for select to authenticated
  using (public.is_member(client_id));

drop policy if exists "owners write client_automations" on public.client_automations;
create policy "owners write client_automations"
  on public.client_automations for all to authenticated
  using (
    public.is_sitewyre_admin()
    or public.member_role(client_id) in ('owner', 'office')
  )
  with check (
    public.is_sitewyre_admin()
    or public.member_role(client_id) in ('owner', 'office')
  );
