-- Block 8: Website chat widget.

alter table public.clients
  add column if not exists chat_widget_enabled boolean not null default false,
  add column if not exists ai_chat_replies_used_this_month integer not null default 0;

-- Chat conversations are saved in the same messages table as texts and
-- emails, under their own channel, so they show in the inbox thread.
alter table public.messages drop constraint if exists messages_channel_check;
alter table public.messages
  add constraint messages_channel_check
  check (channel in ('sms', 'email', 'call', 'note', 'chat'));

-- One row per website chat conversation. The visitor's browser holds a
-- random token; only its hash is stored. ip_hash is for rate limiting.
create table if not exists public.chat_sessions (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  contact_id uuid not null references public.contacts (id) on delete cascade,
  lead_id uuid references public.leads (id) on delete set null,
  token_hash text not null unique,
  ip_hash text,
  visitor_message_count integer not null default 0,
  last_message_at timestamptz,
  owner_alerted_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists chat_sessions_client_idx
  on public.chat_sessions (client_id, created_at desc);
create index if not exists chat_sessions_ip_idx
  on public.chat_sessions (ip_hash, created_at desc);

alter table public.chat_sessions enable row level security;

-- Members can read their own business's sessions. There is no member write
-- policy on purpose: sessions are only created and updated by the public
-- chat API, which uses the service role.
drop policy if exists "members read chat_sessions" on public.chat_sessions;
create policy "members read chat_sessions"
  on public.chat_sessions for select to authenticated
  using (public.is_member(client_id));
