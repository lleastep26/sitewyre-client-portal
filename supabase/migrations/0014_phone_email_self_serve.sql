-- Pass 1 of the self-serve "Phone & Email" section: phone number self-serve
-- (reusing existing Twilio adapter methods, no sending-path changes) and
-- email domain verification via Resend. Additive only.
--
-- The A2P Trust Hub pipeline (Pass 2) is a separate, later migration.

alter table public.clients
  add column if not exists sms_monthly_allowance integer not null default 500,
  add column if not exists email_domain text,
  add column if not exists email_domain_resend_id text,
  add column if not exists email_domain_status text,
  add column if not exists email_dns_records jsonb,
  add column if not exists email_from_name text,
  add column if not exists email_reply_to text;
