alter table clients
  add column if not exists email_domain_verified_at timestamptz;
