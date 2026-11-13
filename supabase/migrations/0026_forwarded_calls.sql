-- Forwarded calls: a client keeps their own business number and sets
-- conditional call forwarding (busy / no answer) from it to their Sitewyre
-- number. Those calls go straight to the AI receptionist instead of
-- ringing the owner a second time.

alter table public.clients
  -- The client says their own number forwards unanswered calls to Sitewyre.
  add column if not exists call_forwarding_enabled boolean not null default false,
  -- The client's own business number that does the forwarding.
  add column if not exists business_line_phone text;

alter table public.calls
  -- Set on every call handled as forwarded: the number Twilio says it was
  -- forwarded from, else the client's saved business number, else 'unknown'.
  add column if not exists forwarded_from text;

-- No new tables: both tables keep their existing client_id and RLS policies.
