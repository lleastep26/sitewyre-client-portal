-- Block 4: Lead workflow.
-- lifecycle_status tracks the automation-driven lead lifecycle
-- (new/contacted/replied/booked/no_show/lost) separately from the
-- business's own customizable pipeline_stages/stage_id — a business may
-- rename or reorder its kanban stages, so automations never assume a
-- stage name exists.

alter table public.leads
  add column if not exists lifecycle_status text not null default 'new',
  add column if not exists last_texted_at timestamptz;

create index if not exists leads_lifecycle_status_idx
  on public.leads (client_id, lifecycle_status);
