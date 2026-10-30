-- Inbox saved replies (P1-T4 remainder).
create table if not exists public.saved_replies (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  title text not null,
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz default now()
);

create index if not exists saved_replies_client_idx
  on public.saved_replies (client_id, created_at desc);

alter table public.saved_replies enable row level security;

drop policy if exists "members read saved_replies" on public.saved_replies;
create policy "members read saved_replies"
  on public.saved_replies for select to authenticated
  using (public.is_member(client_id));

drop policy if exists "owners write saved_replies" on public.saved_replies;
create policy "owners write saved_replies"
  on public.saved_replies for all to authenticated
  using (
    public.is_sitewyre_admin()
    or public.member_role(client_id) in ('owner', 'office')
  )
  with check (
    public.is_sitewyre_admin()
    or public.member_role(client_id) in ('owner', 'office')
  );
