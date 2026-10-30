import Link from "next/link";
import { requireMembership } from "@/lib/auth/session";
import { SetupChecklist } from "@/components/home/setup-checklist";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default async function HomePage() {
  const { supabase, client, role } = await requireMembership();
  if (!client) {
    return (
      <div className="px-4">
        <h1 className="font-display text-3xl">Sitewyre Admin</h1>
        <p className="mt-2 text-sm text-charcoal/70">No client accounts yet.</p>
      </div>
    );
  }

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const staleBefore = new Date(startOfDay);
  staleBefore.setDate(staleBefore.getDate() - 2);

  const [{ count: leadsToday }, { data: unanswered }, { data: jobsToday }, { data: unpaid }, { data: stale }] =
    await Promise.all([
      supabase
        .from("leads")
        .select("*", { count: "exact", head: true })
        .eq("client_id", client.id)
        .gte("created_at", startOfDay.toISOString()),
      supabase
        .from("messages")
        .select("id, contact_id, body, created_at")
        .eq("client_id", client.id)
        .eq("direction", "inbound")
        .order("created_at", { ascending: false })
        .limit(5),
      supabase
        .from("jobs")
        .select("id, address, status, scheduled_start")
        .eq("client_id", client.id)
        .gte("scheduled_start", startOfDay.toISOString())
        .order("scheduled_start", { ascending: true })
        .limit(5),
      supabase
        .from("invoices")
        .select("id, number, total, amount_paid, status")
        .eq("client_id", client.id)
        .neq("status", "paid")
        .limit(5),
      supabase
        .from("leads")
        .select("id, name, last_activity_at, created_at")
        .eq("client_id", client.id)
        .lt("last_activity_at", staleBefore.toISOString())
        .limit(5),
    ]);

  const nextAction =
    (stale && stale[0] && {
      label: `Follow up with ${stale[0].name}`,
      href: `/leads`,
    }) ||
    (unanswered && unanswered[0] && {
      label: "Reply to unanswered message",
      href: "/inbox",
    }) ||
    (leadsToday && leadsToday > 0 && {
      label: "Review today's new leads",
      href: "/leads",
    }) || {
      label: "Invite your crew or add a service",
      href: "/settings",
    };

  return (
    <div className="space-y-4 px-4">
      <header>
        <p className="text-xs uppercase tracking-[0.2em] text-copper">Home</p>
        <h1 className="mt-1 font-display text-3xl">
          {client.business_name ?? "Your business"}
        </h1>
        <p className="mt-1 text-sm text-charcoal/60">
          Signed in as {role.replace("_", " ")}
        </p>
      </header>

      <Card className="border-copper/30 bg-copper/5">
        <CardTitle>Next thing to do</CardTitle>
        <CardDescription className="mt-1">{nextAction.label}</CardDescription>
        <Link href={nextAction.href} className="mt-3 inline-block text-sm text-copper">
          Open →
        </Link>
      </Card>

      <div className="grid grid-cols-2 gap-3">
        <Stat label="New leads today" value={String(leadsToday ?? 0)} href="/leads" />
        <Stat
          label="Unanswered"
          value={String(unanswered?.length ?? 0)}
          href="/inbox"
        />
        <Stat label="Jobs today" value={String(jobsToday?.length ?? 0)} href="/jobs" />
        <Stat
          label="Unpaid invoices"
          value={String(unpaid?.length ?? 0)}
          href="/invoices"
        />
      </div>

      {stale && stale.length ? (
        <Card>
          <CardTitle className="flex items-center gap-2">
            Stale leads <Badge className="bg-red-100 text-red-700">Needs attention</Badge>
          </CardTitle>
          <ul className="mt-2 space-y-1 text-sm">
            {stale.map((l) => (
              <li key={l.id}>{l.name}</li>
            ))}
          </ul>
        </Card>
      ) : null}

      <SetupChecklist
        checklist={(client.setup_checklist as Record<string, boolean> | null) ?? null}
      />
    </div>
  );
}

function Stat({
  label,
  value,
  href,
}: {
  label: string;
  value: string;
  href: string;
}) {
  return (
    <Link href={href}>
      <Card>
        <p className="text-2xl font-display text-charcoal">{value}</p>
        <p className="mt-1 text-xs text-charcoal/60">{label}</p>
      </Card>
    </Link>
  );
}
