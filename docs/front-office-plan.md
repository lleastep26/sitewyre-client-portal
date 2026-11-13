# Claude Code Build Spec

Save this section as docs/front-office-plan.md in sitewyre-client-portal and work through it block by block. It is the source of truth for today.

## Rules for every block

1. Read this file, then report a plan for the block (files, migrations, APIs, costs) and wait for my OK before writing code.
2. Reuse what exists: Inngest, sendFunnelMessage, isOptedOut, checkA2pGate, quiet hours, workflow_runs, requireMembership, the admin view-as switcher.
3. Every new table has client_id and RLS matching the existing pattern.
4. Give me migrations to run in Supabase Studio. Never apply them yourself.
5. Never run paid actions (Twilio numbers, A2P, Retell agents or calls, phone imports) without asking me in the moment.
6. Mock all external APIs in tests. Never paste or ask for secret keys; I add them to Vercel myself.
7. After each block: typecheck, lint, run tests, commit, push, confirm the Vercel deploy and Inngest sync, then stop and tell me how to test it.
8. All texting respects opt-outs, A2P status and quiet hours. All AI never invents facts, never quotes prices, never promises times or outcomes.

## Block 1: Agency layer

1. New agencies table (id, name, owner user). Add agency_id to clients. Seed Sitewyre as agency one and assign every existing client to it.
2. Roles: agency_admin sees and switches between only their agency's sub-accounts. sitewyre_admin keeps seeing everything.
3. Create a Sitewyre sub-account for my own business's leads and workflows.
4. Update /admin, the view-as switcher and RLS helpers to scope by agency.
5. Add an "Add client" form on /admin (business name, owner name, owner email, phone, niche) using the existing account-creation logic, including the welcome email and seeding automations.
6. No self-serve agency signup or white-labelling yet.
7. Tests: an agency admin can never see another agency's clients.

## Block 2: Niche system

1. Niche presets drive labels, pipeline stages, default templates and appointment types.
2. Contractors default: jobs, customers, estimate walkthrough (1 hour), repair or service visit (1 hour), quick consult (30 min).
3. Add presets for med spa (appointments, clients, consultation, treatment) and veterinary (appointments, pet owners, checkup, sick visit), plus a generic fallback.
4. Changing niche never overwrites a client's existing stages, templates or appointment types.

## Block 3: Business knowledge page

1. New Settings tab "Business knowledge": services offered, service area, business hours per day, after-hours rules, FAQs (question and answer pairs), and things the AI must never say.
2. Prefill from Business Profile and niche preset.
3. One server function builds a knowledge summary from this page; the receptionist, text assistant and chat widget all use it.

## Block 4: Lead workflow

1. New lead (any source): instant text (existing lead auto-reply) plus owner alert.
2. No reply: follow-up texts at +1 day, +3 days and +7 days, then stop. Editable templates per client.
3. Lead replies (not STOP): cancel remaining follow-ups, text the owner "[Name] replied: [message], reply in your portal inbox." Owner handles it (the AI text assistant comes in Block 7).
4. Booked: cancel follow-ups, send a confirmation text right away, reminders 24 hours and 1 hour before, and a no-show text if marked no-show. Reuse the existing appointment reminder logic where it fits.
5. Lead stages update automatically: new, contacted, replied, booked, no-show, lost.
6. Old-lead reactivation: one-click campaign on the Leads page to leads that never booked (older than 30 days, not opted out, not texted in 90 days), using the same 40-a-day pacing as the review blast.
7. Show each lead's workflow timeline (what was sent, what's scheduled) on the lead.

## Block 5: Calendar connectors

1. Settings tab "Calendars": connect Google Calendar and Outlook (Microsoft Graph) via OAuth. Store tokens encrypted, refresh automatically.
2. Two-way sync: portal appointments create events on the connected calendar; busy times from the connected calendar block availability.
3. One availability function: business hours from Business knowledge, minus busy times, minus existing appointments, with a buffer between appointments (default 30 minutes, adjustable).
4. Google app stays in testing mode (up to 100 test users) until verification; show a clear message if the app isn't verified.
5. If no calendar is connected, use the portal calendar alone.

## Block 6: AI receptionist (Retell)

1. One Retell agent per client, created through Retell's API from the Business knowledge summary, niche and appointment types. Updating Business knowledge updates the agent.
2. Import the client's existing Twilio number into Retell for inbound calls only. Texting stays on the portal's Twilio and Messaging Service setup unchanged.
3. Call flow: during business hours, ring the owner's forward number first (existing dial timeout); if unanswered, hand the call to the Retell agent. After hours, the agent answers directly. Confirm the cleanest way to do this with Twilio and Retell and tell me before building.
4. Agent tools (Retell custom functions calling portal endpoints): check availability, book appointment, create or update lead, flag emergency.
5. After every call: create or update the lead with a transcript summary and recording link, and text the owner: caller name, number, what they need, and the booking if one was made.
6. When the AI handled the call, don't also send the missed-call text-back.
7. Emergencies: send the owner one urgent text and ring them once more. If they answer, transfer the caller. If not, tell the caller the team has been alerted and will reach out shortly, and offer the earliest slot. Never ring the owner repeatedly. If anyone is in danger, tell them to call 911.
8. AI call-back for new web leads: within 1 minute of a web form lead, the agent calls the lead to book them, only during business hours and only if the client turns it on.
9. Usage: track AI call minutes per client per month against an allowance (default 200, admin-adjustable). Flag clients over the limit on /admin for manual billing; don't cut service off.
10. Per-client on/off switches for the receptionist, booking, and web-lead call-backs.

## Block 7: AI text assistant

1. When a lead replies and the client has the assistant on, the AI answers from the Business knowledge summary and tries to book using the availability function.
2. Hands off to the owner (stops replying, alerts them) if it doesn't know the answer, the customer is upset, asks for a person, or mentions an emergency.
3. Never invents facts, quotes prices or promises times. Respects opt-outs, A2P status and quiet hours.
4. Every AI message is marked as AI in the portal inbox; the owner can take over any thread with one tap.
5. Usage: AI replies per client per month against an allowance (default 500, admin-adjustable), flagged on /admin when over.

## Block 8: Website chat widget

1. One script tag per client (keyed by site key) that shows a chat bubble on their website.
2. First collects name, phone and what they need, with the SMS consent disclosure, and creates the lead immediately (so the Block 4 workflow starts).
3. Then the AI answers questions only from the Business knowledge summary. No pricing, no promises; if unsure, says the team will follow up.
4. Conversation saved to the lead. Rate limiting and basic bot protection.
5. Add the script tag to the Contractor Site Generator template (back up the n8n workflow first) and give me a snippet to paste into existing sites.

## Block 9: Ads connection screens

1. Settings tab "Integrations" with Connect cards for Meta (lead ads and ad stats), Google Local Services Ads and Google Business Profile.
2. Each shows "Pending approval" until the API access is approved. Build the database tables and screens, but no live API calls yet.

## Block 10: Dry run

1. Create a test client from /admin with "Add client" and walk the onboarding checklist.
2. Test: web lead triggers the instant text and follow-up schedule, a reply stops follow-ups, booking sends confirmation and reminders, the chat widget creates a lead, and the receptionist answers a test call (ask me before any paid Retell or Twilio action).
3. Report anything broken, then clean up the test data.
