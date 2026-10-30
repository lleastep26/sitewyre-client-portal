import { requireMembership } from "@/lib/auth/session";
import { LeadsBoard } from "@/components/leads/board";
import { createLead } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ new?: string; view?: string }>;
}) {
  const params = await searchParams;
  const { supabase, client } = await requireMembership();
  if (!client) return null;

  const [{ data: stages }, { data: leads }] = await Promise.all([
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

      {params.new ? (
        <form action={async (fd) => { await createLead(fd); }} className="mx-4 space-y-2 rounded-xl border border-charcoal/10 bg-white p-4">
          <Input name="name" placeholder="Name" required />
          <Input name="phone" placeholder="Phone" required />
          <Input name="email" placeholder="Email" type="email" />
          <Input name="message" placeholder="Notes" />
          <Button type="submit" className="w-full">
            Add lead
          </Button>
        </form>
      ) : null}

      {params.view === "list" ? (
        <ul className="space-y-2 px-4">
          {(leads ?? []).map((lead) => (
            <li key={lead.id} className="rounded-lg border border-charcoal/10 bg-white p-3">
              <p className="font-medium">{lead.name}</p>
              <p className="text-xs text-charcoal/60">
                {lead.phone} · {lead.source ?? "manual"}
              </p>
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
