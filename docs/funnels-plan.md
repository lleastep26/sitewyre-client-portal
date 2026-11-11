# Sitewyre Funnels Launch Plan

Goal: add three GoHighLevel-style funnels to Sitewyre, running on the existing stack (n8n, Twilio, Supabase, client portal). Edit anything in [brackets].

## Funnel 1: Missed-Call Text-Back

Trigger: a call to the contractor's Twilio number goes unanswered.

Steps:

1. Twilio forwards the call to the contractor's cell. If no answer after [20] seconds, a status webhook fires to n8n.
2. n8n checks Supabase: has this number been texted in the last [24] hours? If yes, stop.
3. Send SMS: "Hey, this is [Business Name]. Sorry we missed your call! How can we help? Reply here and we'll get right back to you."
4. Create or update the lead in the portal CRM with source = Missed Call.
5. Text the contractor: "Missed call from [number]. Auto-text sent."

## Funnel 2: Post-Job Review Request

Trigger: the contractor marks a job Complete in the portal (or texts a keyword like DONE plus the customer's number).

Schedule:

1. [2] hours after completion: "Hi [First Name], thanks for choosing [Business Name]! If you have 30 seconds, a quick Google review helps us a ton: [Review Link]"
2. Day 2, if no click: "Hi [First Name], just a friendly reminder. Your review means a lot to our small business: [Review Link]"
3. Day 5, if no click: final reminder, then stop.

Rules: maximum 3 messages. Stop as soon as the link is clicked or the customer replies STOP. Every customer gets the same Google link (no review gating, no rewards).

## Funnel 3: Onboarding Past-Customer Review Blast

Trigger: a new client uploads a CSV of past customers during onboarding.

CSV columns: first_name, phone, job_type (optional), approximate job date (optional).

Steps:

1. The client ticks a box: "I confirm these are my real past customers who gave me their number."
2. n8n cleans the list: formats numbers, removes duplicates and anyone on the opt-out list.
3. Sends in batches of [25 to 50] a day, during [10am to 6pm] local time only.
4. Message: "Hi [First Name], it's [Owner Name] from [Business Name]. We did your [job_type] a while back and would really appreciate a quick Google review: [Review Link]. Reply STOP to opt out."
5. One reminder on day 3 if there's no click, then stop.
6. The portal shows the client a tracker: sent, clicked, reviews gained.

## Compliance Setup (do this first)

1. Register A2P 10DLC brand and campaign in Twilio for each client (or under Sitewyre as the ISV).
2. Include opt-out language in the first message to every new number.
3. Store STOP replies in a Supabase opt-out table and check it before every send.
4. Generate each client's direct Google review link from their Place ID.

## Build Order

1. Week 1: Twilio A2P registration, opt-out table, Google review link generator.
2. Week 2: Missed-call text-back in n8n, tested on one client.
3. Week 3: Post-job review request, plus a Mark Complete button in the portal.
4. Week 4: CSV upload and batch review blast, plus the tracker in the portal.
5. Then: sell it as part of the package with a line like "We'll get you [X] new reviews in your first 30 days."

## Next Funnels After Launch

* Estimate follow-up
* Appointment reminders
* Database reactivation
* Referral request

## Claude Code Build Spec

This section is the source of truth for Claude Code. It supersedes the n8n references above: all funnel logic lives in code inside the sitewyre-client-portal repo.

### Context

* Sitewyre Systems sells contractor websites plus a client portal. Each contractor is a "client" (tenant).
* Repo: sitewyre-client-portal (Next.js App Router, TypeScript), deployed on Vercel.
* Database: reuse the EXISTING Sitewyre Supabase project (already used for portal login). Do not create a new project or new keys.
* SMS: Twilio. Each client gets their own local Twilio number. Sitewyre already has an A2P 10DLC registration; each client also needs their own brand/campaign registered under Sitewyre's Twilio account as a secondary customer profile.
* Billing: Stripe (already in use).
* Access model (like GoHighLevel agency + sub-accounts): the Sitewyre admin can see and edit every client account; each client sees only their own.

### Existing Supabase Tables (read first)

The Supabase project already has tables from an earlier, unfinished CRM attempt, including `follow_ups`, `jobs` and `invoices` (check exact names).

1. Before writing any migration, list every existing table, column and RLS policy, and report back what you find.
2. Do NOT drop, rename or delete data from any existing table.
3. If a table already fits (for example `jobs`), extend it with new columns instead of making a duplicate.
4. If an existing table conflicts with this spec, stop and ask before changing it.
5. Leave unrelated tables (like `invoices`) alone for now.

### Roles and Security

1. Roles: `super_admin` (Sitewyre owner, all tenants) and `client_owner` / `client_user` (one tenant).
2. Every tenant-owned table has a `client_id` column.
3. Enable Row Level Security on every table. Policy: row visible if `client_id` is in the user's memberships, or user is `super_admin`.
4. Admin UI has a client switcher to "view as" any client account.
5. Twilio and Stripe secrets live only in server environment variables, never in the browser.

### Data Model (Supabase tables)

1. `clients`: id, business_name, owner_name, timezone, google_place_id, google_review_url, twilio_number, twilio_number_sid, a2p_status (pending/approved/failed), forward_to_phone, created_at.
2. `memberships`: user_id, client_id, role.
3. `contacts`: id, client_id, first_name, last_name, phone (E.164), email, source (web_form/missed_call/import/manual), created_at. Unique on (client_id, phone).
4. `jobs`: id, client_id, contact_id, title, job_type, status (open/completed), completed_at.
5. `opt_outs`: client_id, phone, created_at. Unique on (client_id, phone).
6. `funnel_runs`: id, client_id, contact_id, funnel (missed_call/review_request/review_blast), status (active/completed/stopped), stop_reason, started_at.
7. `scheduled_messages`: id, client_id, contact_id, funnel_run_id, body, send_at, status (queued/sent/failed/cancelled), twilio_sid, error, attempts.
8. `messages`: id, client_id, contact_id, direction (in/out), body, twilio_sid, created_at. Powers the portal inbox.
9. `review_links`: id (short token), client_id, contact_id, funnel_run_id, clicked_at.
10. `imports`: id, client_id, file_name, total_rows, valid_rows, skipped_rows, consent_confirmed_by, consent_confirmed_at.
11. `message_templates`: client_id, funnel, step, body. Seed with the default texts above; clients can edit them.

### Message Engine

1. Funnels never send directly. They insert rows into `scheduled_messages`.
2. A Vercel cron hits `/api/cron/send-messages` every minute (protected by a CRON_SECRET header).
3. The cron picks up to [100] queued rows where send_at is due, locking them so two runs can't double-send.
4. Before each send: skip and cancel if the phone is in `opt_outs`, the funnel run is stopped, or it is outside 9am to 7pm in the client's timezone (reschedule to the next allowed window).
5. Send via Twilio from the client's own number, with a status callback URL. Save the sid and log to `messages`.
6. Retry failed sends up to 3 times with backoff, then mark failed.
7. Replace template variables: {first_name}, {business_name}, {owner_name}, {job_type}, {review_link}.
8. Review links are short tracked URLs (`/r/[token]`) that log the click in `review_links` and redirect to the client's Google review URL.

### Funnel Logic

#### Missed-call text-back (`/api/twilio/voice` and `/api/twilio/voice-status`)

1. Incoming call to the client's Twilio number: respond with TwiML that dials `forward_to_phone` with a [20] second timeout.
2. On status no-answer, busy or failed: upsert the contact (source = missed_call).
3. If no missed-call text was sent to this number in the last 24 hours, queue the text-back for immediate send.
4. Queue an alert text to the contractor: "Missed call from {phone}. Auto-text sent."

#### Inbound SMS (`/api/twilio/sms`)

1. Validate the Twilio signature on every webhook.
2. Log the message to `messages` and show it in the portal inbox.
3. STOP, UNSUBSCRIBE, CANCEL, END or QUIT: add to `opt_outs`, cancel all queued messages for that contact, stop active funnel runs. START removes the opt-out.
4. Any other reply stops that contact's active review funnel (a human now takes over) and texts the contractor an alert.

#### Post-job review request (triggered by the Job Complete button)

1. The contractor clicks "Job Complete" on a job or contact in the portal. Show a confirm dialog.
2. Set job status to completed. Start a review_request funnel run.
3. Queue step 1 at +2 hours, step 2 at +2 days, step 3 at +5 days.
4. Before steps 2 and 3 send, cancel them if the review link was clicked.
5. Never start a second review request for the same contact within [90] days.

#### Past-customer review blast (onboarding import)

1. Upload screen accepts CSV with columns: first_name, phone, job_type (optional), job_date (optional).
2. Preview screen: shows valid rows, skipped rows and the reason (bad number, duplicate, opted out).
3. Required checkbox: "I confirm these are my real past customers who gave me their phone number." Save who confirmed and when.
4. Normalize phones to E.164 (US default). Dedupe. Upsert contacts with source = import.
5. Spread sends at [40] per day per client, within the allowed hours. Step 2 reminder at +3 days if not clicked. Then stop.
6. First text to every imported number includes "Reply STOP to opt out."

### Portal Screens

1. Contacts: list, search, contact detail with message history and a Job Complete button.
2. Inbox: two-way texting thread per contact, sent from the client's number.
3. Funnels: an on/off toggle per funnel, edit message templates, live preview with sample data.
4. Review Blast: CSV upload, preview, consent checkbox, progress bar.
5. Results dashboard: texts sent, review links clicked, missed calls recovered, per funnel, last 30 days.
6. Admin (super_admin only): list of all clients, client switcher, Twilio number and A2P status per client, buttons to buy and assign a number.

### Client Onboarding Steps

1. Admin creates the client and invites the owner by email.
2. Admin enters the Google Place ID; the system builds the review URL.
3. Admin buys a local Twilio number for the client's area code from the admin screen; the system sets its voice and SMS webhooks automatically.
4. Admin submits the client's A2P brand and campaign; texting stays disabled until a2p_status is approved.
5. Client uploads past-customer CSV to start the review blast.

### Environment Variables

NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, CRON_SECRET, APP_BASE_URL.

### Build Order for Claude Code

1. Migrations for all tables, plus RLS policies and seed templates.
2. Roles, admin client switcher.
3. Message engine: scheduled_messages, cron sender, opt-out checks, quiet hours.
4. Twilio webhooks: inbound SMS, STOP handling, missed-call voice flow.
5. Tracked review links.
6. Job Complete button and the review request funnel.
7. CSV import and the review blast.
8. Inbox, Funnels settings, Results dashboard.
9. Admin number purchase and A2P status.

### Acceptance Checklist

* A client user can never see another client's data (test with two accounts).
* A missed call to a test number gets a text within 1 minute, and only once per 24 hours.
* Replying STOP cancels every queued message and blocks future sends.
* Clicking Job Complete queues 3 texts; clicking the review link cancels the remaining ones.
* No message ever sends outside 9am to 7pm in the client's timezone.
* A 200-row CSV sends 40 per day, skipping bad and duplicate numbers.
* Running the cron twice at once never double-sends.
* Texting is blocked for any client whose A2P status isn't approved.

### Decisions

* Decided: review blast daily send cap is 40 per day per client.
* Decided: the review blast is included in the package (no extra charge, no separate billing).
