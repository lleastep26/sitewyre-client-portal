-- Block 3: Business knowledge page.

alter table public.clients
  add column if not exists services_offered text,
  add column if not exists after_hours_rules text,
  add column if not exists ai_never_say text;

create table if not exists public.client_faqs (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  question text not null,
  answer text not null,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz default now()
);

create index if not exists client_faqs_client_idx
  on public.client_faqs (client_id, position);

alter table public.client_faqs enable row level security;

drop policy if exists "members read client_faqs" on public.client_faqs;
create policy "members read client_faqs"
  on public.client_faqs for select to authenticated
  using (public.is_member(client_id));

-- Owner and sitewyre_admin/agency_admin only — office and crew view only,
-- same restriction as the sms_monthly_allowance / A2P same-entity gates
-- (an agency_admin's view-as session resolves to member_role() = 'owner',
-- so this already covers them without listing a separate role).
drop policy if exists "owners write client_faqs" on public.client_faqs;
create policy "owners write client_faqs"
  on public.client_faqs for all to authenticated
  using (public.is_sitewyre_admin() or public.member_role(client_id) = 'owner')
  with check (public.is_sitewyre_admin() or public.member_role(client_id) = 'owner');
