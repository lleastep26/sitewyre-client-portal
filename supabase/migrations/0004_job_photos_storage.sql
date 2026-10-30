-- Job photo uploads for crew mode (P2-T4).
-- Apply in Supabase SQL editor after 0003.

insert into storage.buckets (id, name, public)
values ('job-photos', 'job-photos', true)
on conflict (id) do update set public = excluded.public;

-- Public read; writes go through the portal service role / server actions.
drop policy if exists "job_photos_public_read" on storage.objects;
create policy "job_photos_public_read"
  on storage.objects for select
  using (bucket_id = 'job-photos');
