-- Phase 1–3 CRM tables (contacts, pipeline, messaging, jobs, quotes, invoices, etc.)

create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  name text not null,
  phones text[] not null default '{}',
  emails text[] not null default '{}',
  address text,
  source text,
  tags text[] not null default '{}',
  notes text,
  sms_opt_in boolean not null default true,
  email_opt_in boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz default now()
);

create index if not exists contacts_client_id_idx on public.contacts (client_id);
create index if not exists contacts_phones_gin on public.contacts using gin (phones);
create index if not exists contacts_emails_gin on public.contacts using gin (emails);
alter table public.contacts enable row level security;

create table if not exists public.activities (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  contact_id uuid not null references public.contacts (id) on delete cascade,
  type text not null,
  payload jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists activities_contact_idx on public.activities (contact_id, occurred_at desc);
alter table public.activities enable row level security;

create table if not exists public.pipeline_stages (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  name text not null,
  position integer not null default 0,
  is_won boolean not null default false,
  is_lost boolean not null default false
);

create index if not exists pipeline_stages_client_idx on public.pipeline_stages (client_id, position);
alter table public.pipeline_stages enable row level security;

alter table public.leads
  add column if not exists contact_id uuid references public.contacts (id) on delete set null,
  add column if not exists stage_id uuid references public.pipeline_stages (id) on delete set null,
  add column if not exists service text,
  add column if not exists value numeric(12,2),
  add column if not exists source text,
  add column if not exists owner_id uuid references auth.users (id) on delete set null,
  add column if not exists lost_reason text,
  add column if not exists last_activity_at timestamptz,
  add column if not exists first_response_at timestamptz,
  add column if not exists updated_at timestamptz default now();

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  contact_id uuid not null references public.contacts (id) on delete cascade,
  channel text not null check (channel in ('sms', 'email', 'call', 'note')),
  direction text not null check (direction in ('inbound', 'outbound', 'internal')),
  body text,
  media jsonb,
  status text,
  external_id text,
  created_at timestamptz not null default now()
);

create index if not exists messages_contact_idx on public.messages (contact_id, created_at desc);
create index if not exists messages_client_unread_idx on public.messages (client_id, created_at desc);
alter table public.messages enable row level security;

create table if not exists public.calls (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  contact_id uuid references public.contacts (id) on delete set null,
  direction text not null,
  duration integer,
  recording_url text,
  missed boolean not null default false,
  twilio_call_sid text,
  created_at timestamptz not null default now()
);

alter table public.calls enable row level security;

create table if not exists public.services (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  name text not null,
  duration_minutes integer not null default 60,
  default_price numeric(12,2),
  bookable_online boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.services enable row level security;

create table if not exists public.availability (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  weekday integer not null check (weekday between 0 and 6),
  start_time time not null,
  end_time time not null,
  buffer_minutes integer not null default 15,
  min_notice_hours integer not null default 2
);

alter table public.availability enable row level security;

create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  contact_id uuid references public.contacts (id) on delete set null,
  service_id uuid references public.services (id) on delete set null,
  assignee_ids uuid[] not null default '{}',
  start_at timestamptz not null,
  end_at timestamptz not null,
  status text not null default 'scheduled',
  title text,
  created_at timestamptz not null default now()
);

alter table public.appointments enable row level security;

create table if not exists public.quotes (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  contact_id uuid references public.contacts (id) on delete set null,
  number text not null,
  line_items jsonb not null default '[]'::jsonb,
  options jsonb,
  total numeric(12,2) not null default 0,
  status text not null default 'draft',
  public_token text not null unique,
  signed_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz default now()
);

alter table public.quotes enable row level security;

create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  contact_id uuid references public.contacts (id) on delete set null,
  quote_id uuid references public.quotes (id) on delete set null,
  address text,
  status text not null default 'scheduled',
  scheduled_start timestamptz,
  scheduled_end timestamptz,
  assignee_ids uuid[] not null default '{}',
  checklist jsonb not null default '[]'::jsonb,
  photos text[] not null default '{}',
  recurrence_rule text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz default now()
);

alter table public.jobs enable row level security;

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  job_id uuid references public.jobs (id) on delete set null,
  contact_id uuid references public.contacts (id) on delete set null,
  number text not null,
  line_items jsonb not null default '[]'::jsonb,
  total numeric(12,2) not null default 0,
  amount_paid numeric(12,2) not null default 0,
  due_at timestamptz,
  status text not null default 'open',
  public_token text not null unique,
  stripe_payment_intent_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz default now()
);

alter table public.invoices enable row level security;

create table if not exists public.workflow_runs (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  trigger text not null,
  status text not null default 'sent',
  log jsonb,
  created_at timestamptz not null default now()
);

alter table public.workflow_runs enable row level security;

create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  subject text not null,
  status text not null default 'open',
  priority text not null default 'normal',
  messages jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz default now()
);

alter table public.support_tickets enable row level security;

create table if not exists public.integrations (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  provider text not null,
  encrypted_tokens text,
  status text not null default 'disconnected',
  sync_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz default now(),
  unique (client_id, provider)
);

alter table public.integrations enable row level security;

create table if not exists public.plan_features (
  plan text not null,
  feature text not null,
  enabled boolean not null default true,
  primary key (plan, feature)
);

insert into public.plan_features (plan, feature, enabled) values
  ('contractor_299', 'leads', true),
  ('contractor_299', 'inbox', true),
  ('contractor_299', 'calendar', true),
  ('contractor_299', 'jobs', true),
  ('contractor_299', 'quotes', true),
  ('contractor_299', 'invoices', true),
  ('contractor_299', 'reporting', true),
  ('contractor_299', 'recurring_jobs', true),
  ('pro', 'workflow_builder', true)
on conflict do nothing;

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now(),
  unique (user_id, endpoint)
);

alter table public.push_subscriptions enable row level security;

-- RLS: member read/write helpers
do $$
declare
  t text;
begin
  foreach t in array array[
    'contacts','activities','pipeline_stages','messages','calls','services',
    'availability','appointments','quotes','jobs','invoices','workflow_runs',
    'support_tickets','integrations','push_subscriptions'
  ]
  loop
    execute format('drop policy if exists "members read %1$s" on public.%1$s', t);
    execute format(
      'create policy "members read %1$s" on public.%1$s for select to authenticated using (public.is_member(client_id))',
      t
    );
    execute format('drop policy if exists "members write %1$s" on public.%1$s', t);
    execute format(
      'create policy "members write %1$s" on public.%1$s for all to authenticated using (public.is_member(client_id)) with check (public.is_member(client_id))',
      t
    );
  end loop;
end $$;
