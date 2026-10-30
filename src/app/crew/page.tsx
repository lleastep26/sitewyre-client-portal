import { requireMembership } from "@/lib/auth/session";
import { JobStatusButtons } from "@/app/(app)/jobs/job-actions-form";
import { CrewChecklist } from "./checklist";

export default async function CrewPage() {
  const { supabase, client, user } = await requireMembership();
  if (!client) return null;

  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date();
  end.setHours(23, 59, 59, 999);

  const { data: jobs } = await supabase
    .from("jobs")
    .select("*")
    .eq("client_id", client.id)
    .contains("assignee_ids", [user.id])
    .gte("scheduled_start", start.toISOString())
    .lte("scheduled_start", end.toISOString())
    .order("scheduled_start");

  return (
    <main className="mx-auto min-h-dvh max-w-lg bg-[radial-gradient(ellipse_at_top,_#fbf7f2,_#e8dccb)] px-4 py-6">
      <p className="text-xs uppercase tracking-[0.2em] text-copper">Crew mode</p>
      <h1 className="mt-1 font-display text-3xl">Today</h1>
      <ul className="mt-4 space-y-3">
        {(jobs ?? []).map((job) => (
          <li key={job.id} className="rounded-xl border bg-white p-4">
            <p className="font-medium">{job.address ?? "Job"}</p>
            {job.address ? (
              <a
                className="text-sm text-copper"
                href={`https://maps.google.com/?q=${encodeURIComponent(job.address)}`}
                target="_blank"
                rel="noreferrer"
              >
                Open in Maps
              </a>
            ) : null}
            <CrewChecklist
              jobId={job.id}
              checklist={
                (job.checklist as { id: string; label: string; done: boolean }[]) ??
                []
              }
            />
            <JobStatusButtons jobId={job.id} />
          </li>
        ))}
        {!jobs?.length ? (
          <p className="text-sm text-charcoal/60">No jobs assigned today.</p>
        ) : null}
      </ul>
    </main>
  );
}
