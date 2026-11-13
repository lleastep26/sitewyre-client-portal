import { requireMembership } from "@/lib/auth/session";
import { LeadsBoard } from "@/components/leads/board";
import { createLeadAction } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { ReactivateOldLeadsButton } from "./reactivate-button";

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ new?: string; view?: string; open?: string }>;
}) {
  const params = await searchParams;
  const { supabase, client } = await requireMembership();
  if (!client) return null;
  const openId = params.open;

  const [{ data: stages }, { data: leads }, { data: timeline }] = await Promise.all([
    supabase
      .from("pipeline_stages")
      .select("*")
      .eq("client_id", client.id)
      .order("position"),
    supabase
      .from("leads")
      .select("*")
      .eq("client_id", client.id)
      .order("created_at", { ascending: false }),
    openId
      ? supabase
          .from("workflow_runs")
          .select("trigger, status, log, created_at")
          .eq("client_id", client.id)
          .contains("log", { leadId: openId })
          .order("created_at", { ascending: true })
      : Promise.resolve({ data: null }),
  ]);

  return (
    <div className="space-y-4">
      <header className="px-4">
        <p className="text-xs uppercase tracking-[0.2em] text-copper">Leads</p>
        <h1 className="mt-1 font-display text-3xl">Pipeline</h1>
        <p className="mt-1 text-sm text-charcoal/60">
          Drag cards between stages. Untouched leads turn red after 2 days.
        </p>
      </header>

      <ReactivateOldLeadsButton />

      {params.new ? (
        <form action={createLeadAction} className="mx-4 space-y-2 rounded-xl border border-charcoal/10 bg-white p-4">
          <Input name="name" placeholder="Name" required />
          <Input name="phone" placeholder="Phone" required />
          <Input name="email" placeholder="Email" type="email" />
          <Input name="message" placeholder="Notes" />
          <Button type="submit" className="w-full">
            Add lead
          </Button>
        </form>
      ) : null}

      {params.view === "list" || openId ? (
        <ul className="space-y-2 px-4">
          {(leads ?? []).map((lead) => (
            <li
              key={lead.id}
              id={`lead-${lead.id}`}
              className={cn(
                "rounded-lg border bg-white p-3",
                lead.id === openId
                  ? "border-copper ring-2 ring-copper"
                  : "border-charcoal/10",
              )}
            >
              <p className="font-medium">{lead.name}</p>
              <p className="text-xs text-charcoal/60">
                {lead.phone} · {lead.source ?? "manual"} · {lead.lifecycle_status}
              </p>
              {lead.id === openId ? (
                <div className="mt-2 space-y-1 border-t border-charcoal/10 pt-2">
                  <p className="text-xs font-medium uppercase tracking-wide text-charcoal/50">
                    Workflow timeline
                  </p>
                  {(timeline ?? []).length ? (
                    <ul className="space-y-1">
                      {(timeline ?? []).map((run, i) => (
                        <li key={i} className="text-xs text-charcoal/70">
                          {new Date(run.created_at).toLocaleString()} —{" "}
                          {run.trigger.replaceAll("_", " ")} ({run.status})
                          <TimelineDetail log={run.log} />
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-charcoal/50">
                      Nothing logged yet.
                    </p>
                  )}
                </div>
              ) : null}
            </li>
          ))}
          {!leads?.length ? (
            <Empty
              title="No leads yet"
              body="Submit a test lead from your website or add one manually."
              href="/leads?new=1"
              cta="Add lead"
            />
          ) : null}
        </ul>
      ) : (
        <>
          {!stages?.length ? (
            <div className="px-4">
              <Empty
                title="Pipeline not set up"
                body="Trade presets load stages on account create. Re-run setup from Settings."
                href="/settings"
                cta="Open settings"
              />
            </div>
          ) : (
            <LeadsBoard stages={stages} leads={leads ?? []} />
          )}
        </>
      )}
    </div>
  );
}

function Empty({
  title,
  body,
  href,
  cta,
}: {
  title: string;
  body: string;
  href: string;
  cta: string;
}) {
  return (
    <div className="rounded-xl border border-dashed border-charcoal/20 bg-white/50 p-6 text-center">
      <p className="font-display text-xl">{title}</p>
      <p className="mt-2 text-sm text-charcoal/60">{body}</p>
      <a href={href} className="mt-4 inline-block text-sm text-copper">
        {cta} →
      </a>
    </div>
  );
}

/** Extra detail for timeline entries that carry it — today, the AI
 * receptionist's call summary and recording link. */
function TimelineDetail({ log }: { log: unknown }) {
  const entry = (log ?? {}) as { summary?: unknown; recordingUrl?: unknown };
  const summary = typeof entry.summary === "string" ? entry.summary : null;
  const recordingUrl =
    typeof entry.recordingUrl === "string" && entry.recordingUrl.startsWith("https://")
      ? entry.recordingUrl
      : null;
  if (!summary && !recordingUrl) return null;
  return (
    <span className="mt-0.5 block text-charcoal/60">
      {summary}
      {recordingUrl ? (
        <>
          {" "}
          <a href={recordingUrl} target="_blank" rel="noopener noreferrer" className="text-copper underline">
            Listen to recording
          </a>
        </>
      ) : null}
    </span>
  );
}
