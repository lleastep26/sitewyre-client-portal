-- Baseline: existing Sitewyre public schema (additive-safe).
-- Source of truth notes: sitewyre-systems/supabase/schema.sql + live Studio dump.
-- Apply against the EXISTING Sitewyre Supabase project. Do not create a new project.
-- This file is idempotent (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS).

create extension if not exists "pgcrypto";

create table if not exists public.contact_requests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null,
  phone text not null,
  email text not null,
  trade text,
  preferred_time text,
  message text not null
);

alter table public.contact_requests enable row level security;

create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users (id) on delete cascade,
  business_name text,
  domain text,
  live_site_url text,
  phone text,
  trade text,
  stripe_customer_id text,
  stripe_subscription_id text,
  google_review_url text,
  created_at timestamptz not null default now()
);

alter table public.clients
  add column if not exists phone text,
  add column if not exists trade text,
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_subscription_id text,
  add column if not exists google_review_url text;

alter table public.clients enable row level security;

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  client_id uuid not null references public.clients (id) on delete cascade,
  name text not null,
  phone text not null,
  email text,
  message text not null
);

alter table public.leads enable row level security;

create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  client_id uuid not null references public.clients (id) on delete cascade,
  rating integer not null check (rating between 1 and 5),
  reviewer_name text,
  reviewer_phone text,
  reviewer_email text,
  feedback text,
  routed_to_google boolean not null default false
);

create index if not exists reviews_client_created_at_idx
on public.reviews (client_id, created_at desc);

alter table public.reviews enable row level security;

-- Preserve legacy owner-read policies used by sitewyre-systems /portal
drop policy if exists "clients can read their own row" on public.clients;
create policy "clients can read their own row"
on public.clients
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "clients can read their own leads" on public.leads;
create policy "clients can read their own leads"
on public.leads
for select
to authenticated
using (
  exists (
    select 1
    from public.clients
    where clients.id = leads.client_id
      and clients.user_id = auth.uid()
  )
);

drop policy if exists "clients can read their own reviews" on public.reviews;
create policy "clients can read their own reviews"
on public.reviews
for select
to authenticated
using (
  exists (
    select 1
    from public.clients
    where clients.id = reviews.client_id
      and clients.user_id = auth.uid()
  )
);
