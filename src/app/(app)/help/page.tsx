import { requireMembership } from "@/lib/auth/session";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { getAppUrl } from "@/lib/supabase/env";

const articles = [
  {
    title: "Reply to a new lead",
    body: "Open Inbox or Leads, tap the contact, send a text. Speed-to-lead timer stops on first human reply.",
  },
  {
    title: "Move a lead through the pipeline",
    body: "On Leads, drag the card to Contacted → Quoted → Booked. Lost requires a reason.",
  },
  {
    title: "Book a job",
    body: "Use Calendar (week or day/crew lanes) or share your public booking link.",
  },
  {
    title: "Get paid",
    body: "Connect Stripe in Settings, send a quote (deposit on approve), then invoice with a pay link.",
  },
  {
    title: "Automations",
    body: "More → Automations shows built-in workflows and the recent run log (leads, quotes, invoices, reminders).",
  },
];

export default async function HelpPage() {
  const { client } = await requireMembership();
  const appUrl = getAppUrl();
  let healthOk = false;
  try {
    const res = await fetch(`${appUrl}/api/health`, { cache: "no-store" });
    healthOk = res.ok;
  } catch {
    healthOk = false;
  }

  const checks = [
    {
      label: "Portal health",
      ok: healthOk,
      detail: healthOk ? "Responding" : "Unreachable",
    },
    {
      label: "Twilio number",
      ok: Boolean(client?.twilio_phone_number),
      detail: client?.twilio_phone_number ?? "Not provisioned",
    },
    {
      label: "Stripe Connect",
      ok: Boolean(client?.stripe_connect_account_id),
      detail: client?.stripe_connect_account_id
        ? "Connected"
        : "Not connected",
    },
    {
      label: "Public booking",
      ok: Boolean(client?.site_key),
      detail: client?.site_key ? `/book/${client.site_key}` : "No site key",
    },
  ];

  return (
    <div className="space-y-4 px-4">
      <header>
        <p className="text-xs uppercase tracking-[0.2em] text-copper">Help</p>
        <h1 className="mt-1 font-display text-3xl">Guides</h1>
      </header>

      <Card>
        <CardTitle>System status</CardTitle>
        <ul className="mt-3 space-y-2 text-sm">
          {checks.map((c) => (
            <li key={c.label} className="flex justify-between gap-2">
              <span>{c.label}</span>
              <span className={c.ok ? "text-copper" : "text-charcoal/50"}>
                {c.ok ? "OK" : "Check"} · {c.detail}
              </span>
            </li>
          ))}
        </ul>
        <CardDescription className="mt-3">
          Background health ping runs every 15 minutes via Inngest.
        </CardDescription>
      </Card>

      {articles.map((a) => (
        <Card key={a.title}>
          <CardTitle>{a.title}</CardTitle>
          <CardDescription className="mt-2">{a.body}</CardDescription>
        </Card>
      ))}
      <p className="text-sm text-charcoal/60">
        Stuck? Use Get help on any screen. Mark urgent for leads or texts not
        working.
      </p>
    </div>
  );
}
