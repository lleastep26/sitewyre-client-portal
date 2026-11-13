-- Sitewyre on a client's existing website: one script that adds the chat
-- bubble and captures the site's own forms, plus an "installed" check.

alter table public.clients
  -- The client turned on "capture my website's forms". Off by default so
  -- sites that already send their forms to the portal don't double up.
  add column if not exists form_capture_enabled boolean not null default false,
  -- When the client confirmed the SMS consent wording is under every form
  -- on their own site. Null = not confirmed: captured leads get no texts.
  add column if not exists website_consent_confirmed_at timestamptz,
  -- Last time the script loaded on a page, and on which host.
  add column if not exists website_script_seen_at timestamptz,
  add column if not exists website_script_seen_host text;

-- One row per form submission the script captured. Used for rate limits
-- (ip_hash; IPs are only ever stored hashed) and kept as the record of
-- what consent wording, if any, the form showed.
create table if not exists public.website_form_captures (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  lead_id uuid references public.leads (id) on delete set null,
  page_url text,
  form_label text,
  ip_hash text,
  consent_found boolean not null default false,
  consent_text text,
  sms_consent boolean not null default false,
  outcome text not null default 'created',
  created_at timestamptz not null default now()
);

create index if not exists website_form_captures_client_idx
  on public.website_form_captures (client_id, created_at desc);
create index if not exists website_form_captures_ip_idx
  on public.website_form_captures (ip_hash, created_at desc);

alter table public.website_form_captures enable row level security;

-- Members can read their own business's captures. No member write policy
-- on purpose: rows are only written by the public capture API, which uses
-- the service role.
drop policy if exists "members read website_form_captures" on public.website_form_captures;
create policy "members read website_form_captures"
  on public.website_form_captures for select to authenticated
  using (public.is_member(client_id));
