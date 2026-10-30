import { requireMembership } from "@/lib/auth/session";
import { createAppointment } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { format } from "date-fns";

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ new?: string }>;
}) {
  const params = await searchParams;
  const { supabase, client } = await requireMembership();
  if (!client) return null;

  const { data: appointments } = await supabase
    .from("appointments")
    .select("*")
    .eq("client_id", client.id)
    .order("start_at", { ascending: true })
    .limit(50);

  const { data: members } = await supabase
    .from("memberships")
    .select("user_id, role")
    .eq("client_id", client.id);

  return (
    <div className="space-y-4 px-4">
      <header>
        <p className="text-xs uppercase tracking-[0.2em] text-copper">Calendar</p>
        <h1 className="mt-1 font-display text-3xl">Schedule</h1>
        <p className="mt-1 text-sm text-charcoal/60">
          Day / week / crew views — {members?.length ?? 0} crew on account.
        </p>
      </header>

      {params.new ? (
        <form action={async (fd) => { await createAppointment(fd); }} className="space-y-2 rounded-xl border border-charcoal/10 bg-white p-4">
          <Input name="title" placeholder="Title" required />
          <Input name="start_at" type="datetime-local" required />
          <Input name="end_at" type="datetime-local" required />
          <Button type="submit" className="w-full">Book</Button>
        </form>
      ) : null}

      <div className="space-y-2">
        {(appointments ?? []).map((a) => (
          <article key={a.id} className="rounded-lg border border-charcoal/10 bg-white p-3">
            <p className="font-medium">{a.title ?? "Appointment"}</p>
            <p className="text-xs text-charcoal/60">
              {format(new Date(a.start_at), "EEE MMM d · h:mm a")} –{" "}
              {format(new Date(a.end_at), "h:mm a")}
            </p>
            <p className="mt-1 text-xs text-charcoal/50">
              Assignees: {a.assignee_ids?.length ?? 0} · {a.status}
            </p>
          </article>
        ))}
        {!appointments?.length ? (
          <div className="rounded-xl border border-dashed border-charcoal/20 p-6 text-center">
            <p className="font-display text-xl">Nothing scheduled</p>
            <p className="mt-2 text-sm text-charcoal/60">
              Share your booking page or add an appointment.
            </p>
            <a href="/calendar?new=1" className="mt-3 inline-block text-sm text-copper">
              Add appointment →
            </a>
          </div>
        ) : null}
      </div>

      {client.site_key ? (
        <p className="text-xs text-charcoal/50">
          Public booking: /book/{client.site_key}
        </p>
      ) : null}
    </div>
  );
}
