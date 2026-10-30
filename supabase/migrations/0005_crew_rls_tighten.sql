-- Tighten CRM write RLS: crew can update field work; money/settings stay owner/office.
-- Apply in Supabase SQL editor after 0004.

-- Tables crew may still write (jobs, appointments, messages, activities, contacts, calls)
-- stay on is_member. Re-assert for clarity after drops below.

do $$
declare
  t text;
  office_only text[] := array[
    'quotes','invoices','workflow_runs','integrations','pipeline_stages',
    'services','availability','support_tickets','push_subscriptions'
  ];
  crew_ok text[] := array[
    'contacts','activities','messages','calls','appointments','jobs'
  ];
begin
  foreach t in array office_only
  loop
    execute format('drop policy if exists "members write %1$s" on public.%1$s', t);
    execute format(
      'create policy "members write %1$s" on public.%1$s for all to authenticated
       using (
         public.is_sitewyre_admin()
         or public.member_role(client_id) in (''owner'', ''office'')
       )
       with check (
         public.is_sitewyre_admin()
         or public.member_role(client_id) in (''owner'', ''office'')
       )',
      t
    );
  end loop;

  foreach t in array crew_ok
  loop
    execute format('drop policy if exists "members write %1$s" on public.%1$s', t);
    execute format(
      'create policy "members write %1$s" on public.%1$s for all to authenticated
       using (public.is_member(client_id))
       with check (public.is_member(client_id))',
      t
    );
  end loop;
end $$;
