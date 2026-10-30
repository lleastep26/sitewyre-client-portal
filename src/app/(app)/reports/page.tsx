import { requireMembership } from "@/lib/auth/session";
import { Card, CardTitle } from "@/components/ui/card";

export default async function ReportsPage() {
  const { supabase, client } = await requireMembership();
  if (!client) return null;

  const since = new Date();
  since.setDate(since.getDate() - 30);

  const [
    { count: leadsCount },
    { data: leads },
    { data: invoices },
    { data: reviews },
  ] = await Promise.all([
    supabase
      .from("leads")
      .select("*", { count: "exact", head: true })
      .eq("client_id", client.id)
      .gte("created_at", since.toISOString()),
    supabase
      .from("leads")
      .select("source, first_response_at, created_at, stage_id, value")
      .eq("client_id", client.id)
      .gte("created_at", since.toISOString()),
    supabase
      .from("invoices")
      .select("total, amount_paid, status")
      .eq("client_id", client.id)
      .gte("created_at", since.toISOString()),
    supabase
      .from("reviews")
      .select("id")
      .eq("client_id", client.id)
      .gte("created_at", since.toISOString()),
  ]);

  const bySource: Record<string, number> = {};
  let responseMs = 0;
  let responseN = 0;
  for (const lead of leads ?? []) {
    const src = lead.source ?? "unknown";
    bySource[src] = (bySource[src] ?? 0) + 1;
    if (lead.first_response_at) {
      responseMs +=
        new Date(lead.first_response_at).getTime() -
        new Date(lead.created_at).getTime();
      responseN += 1;
    }
  }

  const collected = (invoices ?? []).reduce(
    (s, i) => s + Number(i.amount_paid ?? 0),
    0,
  );
  const unpaid = (invoices ?? [])
    .filter((i) => i.status !== "paid")
    .reduce((s, i) => s + (Number(i.total) - Number(i.amount_paid)), 0);

  const avgResponseMin =
    responseN > 0 ? Math.round(responseMs / responseN / 60000) : null;

  const csv = [
    "metric,value",
    `leads_30d,${leadsCount ?? 0}`,
    `avg_response_min,${avgResponseMin ?? ""}`,
    `revenue_collected,${collected}`,
    `unpaid,${unpaid}`,
    `reviews,${reviews?.length ?? 0}`,
    ...Object.entries(bySource).map(([k, v]) => `source_${k},${v}`),
  ].join("\n");

  return (
    <div className="space-y-4 px-4">
      <header>
        <p className="text-xs uppercase tracking-[0.2em] text-copper">Reports</p>
        <h1 className="mt-1 font-display text-3xl">Last 30 days</h1>
      </header>

      <div className="grid grid-cols-2 gap-3">
        <Card>
          <p className="text-2xl font-display">{leadsCount ?? 0}</p>
          <p className="text-xs text-charcoal/60">Leads</p>
        </Card>
        <Card>
          <p className="text-2xl font-display">
            {avgResponseMin != null ? `${avgResponseMin}m` : "—"}
          </p>
          <p className="text-xs text-charcoal/60">Avg response</p>
        </Card>
        <Card>
          <p className="text-2xl font-display">${collected.toLocaleString()}</p>
          <p className="text-xs text-charcoal/60">Collected</p>
        </Card>
        <Card>
          <p className="text-2xl font-display">${unpaid.toLocaleString()}</p>
          <p className="text-xs text-charcoal/60">Unpaid</p>
        </Card>
      </div>

      <Card>
        <CardTitle>Leads by source</CardTitle>
        <ul className="mt-2 space-y-1 text-sm">
          {Object.entries(bySource).map(([k, v]) => (
            <li key={k} className="flex justify-between">
              <span>{k}</span>
              <span>{v}</span>
            </li>
          ))}
          {!Object.keys(bySource).length ? (
            <li className="text-charcoal/50">No data yet</li>
          ) : null}
        </ul>
      </Card>

      <a
        className="inline-block text-sm text-copper"
        href={`data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`}
        download="sitewyre-report.csv"
      >
        Download CSV →
      </a>
      <p className="text-xs text-charcoal/50">
        Monthly snapshot SMS runs on the 1st (Inngest) to the business phone when
        set.
      </p>
    </div>
  );
}
