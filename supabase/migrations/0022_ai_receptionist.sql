-- Block 6: AI receptionist (Retell).

alter table public.clients
  add column if not exists ai_receptionist_enabled boolean not null default false,
  add column if not exists ai_receptionist_booking_enabled boolean not null default true,
  add column if not exists ai_receptionist_callback_enabled boolean not null default false,
  add column if not exists retell_llm_id text,
  add column if not exists retell_agent_id text,
  add column if not exists retell_minutes_used_this_month numeric(10, 2) not null default 0,
  add column if not exists retell_minutes_allowance numeric(10, 2) not null default 200;

alter table public.calls
  add column if not exists ai_handled boolean not null default false;

-- Monthly history so overage can be billed after the counter resets.
create table if not exists public.retell_usage_history (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  month_start date not null,
  minutes_used numeric(10, 2) not null default 0,
  minutes_allowance numeric(10, 2) not null default 0,
  created_at timestamptz not null default now(),
  unique (client_id, month_start)
);

create index if not exists retell_usage_history_client_idx
  on public.retell_usage_history (client_id, month_start);

alter table public.retell_usage_history enable row level security;

drop policy if exists "members read retell_usage_history" on public.retell_usage_history;
create policy "members read retell_usage_history"
  on public.retell_usage_history for select to authenticated
  using (public.is_member(client_id));

-- Billing data — Sitewyre admin only, same restriction as the
-- sms_monthly_allowance / A2P same-entity gates (writes happen from the
-- admin client or the Inngest cron's service-role client either way).
drop policy if exists "sitewyre_admin writes retell_usage_history" on public.retell_usage_history;
create policy "sitewyre_admin writes retell_usage_history"
  on public.retell_usage_history for all to authenticated
  using (public.is_sitewyre_admin())
  with check (public.is_sitewyre_admin());
