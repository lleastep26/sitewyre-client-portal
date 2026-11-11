-- Carrier voicemail on the contractor's cell often answers around 20-25s,
-- which Twilio reports as "completed" (not "no-answer"), so the missed-call
-- text never fires. A shorter, per-client-configurable Dial timeout lets
-- each client tune it to their own carrier's voicemail pickup time.
-- Additive only.

alter table public.clients
  add column if not exists dial_timeout_seconds integer not null default 15;
