import Link from "next/link";
import { requireMembership } from "@/lib/auth/session";

const BUILTIN = [
  { key: "lead_auto_reply", label: "1. Lead auto-reply + owner alert", status: "live" },
  {
    key: "lead_unanswered_follow_up",
    label: "2. Unanswered lead follow-up (2 days)",
    status: "live",
  },
  { key: "quote_follow_up", label: "3. Quote follow-ups", status: "planned" },
  {
    key: "appointment_reminder",
    label: "4. Appointment confirm + 24h + 2h (quiet hours)",
    status: "live",
  },
  { key: "on_my_way", label: "5. On-my-way SMS", status: "live" },
  { key: "review_request", label: "6. Review request on complete", status: "live" },
  { key: "invoice_reminder", label: "7. Invoice reminders", status: "partial" },
  { key: "rebooking_nudge", label: "8. Rebooking nudge", status: "planned" },
] as const;

export default async function AutomationsPage() {
  const { supabase, client } = await requireMembership();
  if (!client) return null;

  const { data: runs } = await supabase
    .from("workflow_runs")
    .select("id, trigger, status, log, created_at")
    .eq("client_id", client.id)
    .order("created_at", { ascending: false })
    .limit(50);

  return (
    <div className="space-y-4 px-4">
      <header>
        <p className="text-xs uppercase tracking-[0.2em] text-copper">
          Automations
        </p>
        <h1 className="mt-1 font-display text-3xl">Run log</h1>
        <p className="mt-1 text-sm text-charcoal/70">
          Built-in workflows for {client.business_name}. Quiet hours 9pm–8am (
          {client.timezone ?? "America/Chicago"}).
        </p>
        <Link href="/more" className="mt-1 inline-block text-sm text-copper">
          ← More
        </Link>
      </header>

      <ul className="space-y-1 rounded-xl border border-charcoal/10 bg-white p-3 text-sm">
        {BUILTIN.map((item) => (
          <li key={item.key} className="flex justify-between gap-2 py-1">
            <span>{item.label}</span>
            <span className="shrink-0 text-xs uppercase tracking-wide text-charcoal/50">
              {item.status}
            </span>
          </li>
        ))}
      </ul>

      <section>
        <h2 className="font-display text-xl">Recent runs</h2>
        <ul className="mt-2 space-y-2">
          {(runs ?? []).map((run) => (
            <li
              key={run.id}
              className="rounded-lg border border-charcoal/10 bg-white p-3 text-sm"
            >
              <p className="font-medium">{run.trigger}</p>
              <p className="text-xs text-charcoal/60">
                {run.status} · {new Date(run.created_at).toLocaleString()}
              </p>
            </li>
          ))}
          {!runs?.length ? (
            <p className="text-sm text-charcoal/60">No workflow runs yet.</p>
          ) : null}
        </ul>
      </section>
    </div>
  );
}
