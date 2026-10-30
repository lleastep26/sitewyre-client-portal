-- Enable Realtime for owner mobile Inbox / Leads live updates.
-- Safe to re-run: ignore if already members of the publication.

do $$
begin
  alter publication supabase_realtime add table public.leads;
exception
  when duplicate_object then null;
  when undefined_object then null;
  when others then
    if sqlerrm not like '%already member%' then
      raise;
    end if;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.messages;
exception
  when duplicate_object then null;
  when undefined_object then null;
  when others then
    if sqlerrm not like '%already member%' then
      raise;
    end if;
end $$;
