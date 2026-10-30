import { requireMembership } from "@/lib/auth/session";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { getAppUrl } from "@/lib/supabase/env";
import {
  HEALTH_CHECK_LABELS,
  type HealthChecks,
} from "@/lib/health/checks";

const articles = [
  {
    title: "Reply to a new lead",
    body: "Aim to reply within 15 minutes. Home shows Needs reply when still unanswered; you'll also get an owner SMS/push at 15m if Automations → Speed-to-lead SLA is on. Timer stops on first human reply (Inbox text, email, or note).",
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

type StatusRow = {
  label: string;
  ok: boolean;
  detail: string;
};

export default async function HelpPage() {
  const { client } = await requireMembership();
  const appUrl = getAppUrl();

  let healthOk = false;
  let healthTime: string | null = null;
  let platformChecks: HealthChecks | null = null;
  try {
    const res = await fetch(`${appUrl}/api/health`, { cache: "no-store" });
    healthOk = res.ok;
    if (res.ok) {
      const body = (await res.json()) as {
        time?: string;
        checks?: HealthChecks;
      };
      healthTime = body.time ?? null;
      platformChecks = body.checks ?? null;
    }
  } catch {
    healthOk = false;
  }

  const platformRows: StatusRow[] = [
    {
      label: "Portal API",
      ok: healthOk,
      detail: healthOk
        ? healthTime
          ? `Responding · ${new Date(healthTime).toLocaleString()}`
          : "Responding"
        : "Unreachable",
    },
    ...(Object.keys(HEALTH_CHECK_LABELS) as (keyof HealthChecks)[]).map(
      (key): StatusRow => {
        const ok = platformChecks?.[key] ?? false;
        return {
          label: HEALTH_CHECK_LABELS[key],
          ok: healthOk && ok,
          detail: !healthOk
            ? "Unknown"
            : ok
              ? "Configured"
              : "Not set (optional until needed)",
        };
      },
    ),
  ];

  const accountRows: StatusRow[] = [
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
        <p className="mt-2 text-xs font-medium uppercase tracking-wide text-charcoal/50">
          Platform
        </p>
        <ul className="mt-2 space-y-2 text-sm">
          {platformRows.map((c) => (
            <li key={c.label} className="flex justify-between gap-2">
              <span>{c.label}</span>
              <span className={c.ok ? "text-copper" : "text-charcoal/50"}>
                {c.ok ? "OK" : "Check"} · {c.detail}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-xs font-medium uppercase tracking-wide text-charcoal/50">
          Your account
        </p>
        <ul className="mt-2 space-y-2 text-sm">
          {accountRows.map((c) => (
            <li key={c.label} className="flex justify-between gap-2">
              <span>{c.label}</span>
              <span className={c.ok ? "text-copper" : "text-charcoal/50"}>
                {c.ok ? "OK" : "Check"} · {c.detail}
              </span>
            </li>
          ))}
        </ul>
        <CardDescription className="mt-3">
          Background health ping runs every 15 minutes via Inngest. Missing
          platform keys soft-skip (e.g. VAPID unset → no web push).
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
