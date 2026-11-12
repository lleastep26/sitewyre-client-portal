alter table clients
  add column if not exists a2p_registration_type text,
  add column if not exists a2p_ein_encrypted text,
  add column if not exists a2p_ein_last4 text,
  add column if not exists a2p_pipeline jsonb not null default '{}'::jsonb;
