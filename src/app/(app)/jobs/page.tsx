import Link from "next/link";
import { requireMembership } from "@/lib/auth/session";
import { createJob } from "./actions";
import { JobStatusButtons } from "./job-actions-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default async function JobsPage({
  searchParams,
}: {
  searchParams: Promise<{ new?: string }>;
}) {
  const params = await searchParams;
  const { supabase, client } = await requireMembership();
  if (!client) return null;

  const { data: jobs } = await supabase
    .from("jobs")
    .select("*")
    .eq("client_id", client.id)
    .order("scheduled_start", { ascending: true });

  return (
    <div className="space-y-4 px-4">
      <header>
        <p className="text-xs uppercase tracking-[0.2em] text-copper">Jobs</p>
        <h1 className="mt-1 font-display text-3xl">Work orders</h1>
        <Link href="/crew" className="mt-1 inline-block text-sm text-copper">
          Open crew mode →
        </Link>
      </header>

      {params.new ? (
        <form action={async (fd) => { await createJob(fd); }} className="space-y-2 rounded-xl border bg-white p-4">
          <Input name="address" placeholder="Job address" />
          <Input name="scheduled_start" type="datetime-local" />
          <Button type="submit" className="w-full">
            Create job
          </Button>
        </form>
      ) : null}

      <ul className="space-y-2">
        {(jobs ?? []).map((job) => (
          <li key={job.id} className="rounded-lg border border-charcoal/10 bg-white p-3">
            <p className="font-medium">{job.address ?? "No address"}</p>
            <p className="text-xs text-charcoal/60">{job.status}</p>
            <JobStatusButtons jobId={job.id} />
            <Link
              href={`/invoices?from_job=${job.id}`}
              className="mt-2 inline-block text-xs text-copper"
            >
              Invoice →
            </Link>
          </li>
        ))}
        {!jobs?.length ? (
          <div className="rounded-xl border border-dashed p-6 text-center">
            <p className="font-display text-xl">No jobs yet</p>
            <a href="/jobs?new=1" className="mt-3 inline-block text-sm text-copper">
              Create a job →
            </a>
          </div>
        ) : null}
      </ul>
    </div>
  );
}
