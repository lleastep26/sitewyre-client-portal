# After applying 0018_agency_layer.sql

Run these three checks in order right after applying the migration in
Supabase Studio, before telling anyone to use the new "Add client" form.

## 1. Your own owner login sees only its own clients

Log in as a regular business owner (not an admin). Confirm:
- Their home page, leads, invoices, etc. show only their own business —
  nothing changed from before this migration.
- They have no way to reach `/admin` (no link, and visiting it directly
  redirects away).

## 2. Your sitewyre_admin login sees everything

Log in as your `sitewyre_admin` account. On `/admin`, confirm:
- Every existing client is listed (both Eastep Mechanical Solutions and
  Exclusive Cleaning Services, plus anything created since).
- "View as" still works for any of them.
- The Stripe-link, Twilio number purchase, and A2P status controls are
  still visible (these stay sitewyre_admin-only).

## 3. A test agency_admin sees only its own agency

In Supabase Studio's SQL editor:

```sql
-- Create a second agency and a test client inside it.
insert into agencies (id, name) values (gen_random_uuid(), 'Test Agency')
  returning id;
-- (copy the returned id, call it <test_agency_id> below)

update clients set agency_id = '<test_agency_id>'
  where id = '<pick one existing test client id, NOT a real client>';

-- Make an existing test user an agency_admin of the test agency.
insert into agency_memberships (user_id, agency_id, role)
values ('<a test user's auth.users id>', '<test_agency_id>', 'agency_admin');
```

Then log in as that test user and confirm on `/admin`:
- They see **only** the one client you just moved into Test Agency —
  nothing else.
- "View as" works for that client, but if you try (via a direct request
  or by editing the cookie) to view-as a client outside Test Agency,
  it's rejected back to `/admin`.
- They can use "Add client" — the new client lands in Test Agency
  automatically (check `agency_id` on the new row).
- Clicking Stripe-link, Twilio number purchase, or A2P status controls
  is not possible — those sections don't render for them at all.

Once all three pass, clean up the test agency/user before moving on:

```sql
delete from agency_memberships where agency_id = '<test_agency_id>';
delete from agencies where id = '<test_agency_id>';
-- move the test client's agency_id back to the Sitewyre agency:
update clients set agency_id = 'b39e554f-05e0-488f-8654-1ae3db73f15a'
  where id = '<the client you moved>';
```
