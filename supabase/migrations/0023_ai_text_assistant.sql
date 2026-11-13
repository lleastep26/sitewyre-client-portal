-- Block 7: AI text assistant.

alter table public.clients
  add column if not exists ai_text_assistant_enabled boolean not null default false,
  add column if not exists ai_text_replies_used_this_month integer not null default 0,
  add column if not exists ai_text_replies_allowance integer not null default 500;

-- Per-thread AI state lives on the contact (inbox threads are per contact).
-- ai_paused_at is set when the owner takes over or the AI hands off; null
-- means the assistant may answer.
alter table public.contacts
  add column if not exists ai_paused_at timestamptz,
  add column if not exists ai_paused_reason text;

alter table public.messages
  add column if not exists ai_generated boolean not null default false;

-- Monthly history so overage can be billed after the counter resets.
create table if not exists public.ai_text_usage_history (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  month_start date not null,
  replies_used integer not null default 0,
  replies_allowance integer not null default 0,
  created_at timestamptz not null default now(),
  unique (client_id, month_start)
);

create index if not exists ai_text_usage_history_client_idx
  on public.ai_text_usage_history (client_id, month_start);

alter table public.ai_text_usage_history enable row level security;

drop policy if exists "members read ai_text_usage_history" on public.ai_text_usage_history;
create policy "members read ai_text_usage_history"
  on public.ai_text_usage_history for select to authenticated
  using (public.is_member(client_id));

-- Billing data — Sitewyre admin only, same as retell_usage_history.
drop policy if exists "sitewyre_admin writes ai_text_usage_history" on public.ai_text_usage_history;
create policy "sitewyre_admin writes ai_text_usage_history"
  on public.ai_text_usage_history for all to authenticated
  using (public.is_sitewyre_admin())
  with check (public.is_sitewyre_admin());
