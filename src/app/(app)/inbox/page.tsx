import Link from "next/link";
import { requireMembership } from "@/lib/auth/session";
import { InboxThread, type AiThreadState } from "@/components/inbox/thread";
import { OPEN_LEAD_STATUSES } from "@/lib/leads/lifecycle";
import { getAppUrl } from "@/lib/supabase/env";
import { ensureSavedReplies } from "./actions";

export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<{ contact?: string }>;
}) {
  const params = await searchParams;
  const { supabase, client } = await requireMembership();
  if (!client) return null;

  await ensureSavedReplies().catch(() => undefined);

  const { data: contacts } = await supabase
    .from("contacts")
    .select("id, name, phones, emails, ai_paused_at, ai_paused_reason")
    .eq("client_id", client.id)
    .order("updated_at", { ascending: false })
    .limit(40);

  // Which threads the AI text assistant is on: only contacts with an open
  // lead, and only while the thread hasn't been paused.
  const openLeadContactIds = new Set<string>();
  if (client.ai_text_assistant_enabled) {
    const { data: openLeads } = await supabase
      .from("leads")
      .select("contact_id")
      .eq("client_id", client.id)
      .in("lifecycle_status", OPEN_LEAD_STATUSES);
    for (const lead of openLeads ?? []) {
      if (lead.contact_id) openLeadContactIds.add(lead.contact_id);
    }
  }
  function aiStateFor(c: { id: string; ai_paused_at: string | null; ai_paused_reason: string | null }): AiThreadState {
    if (!client?.ai_text_assistant_enabled) return "off";
    if (c.ai_paused_at) {
      const byOwner = c.ai_paused_reason === "owner_replied" || c.ai_paused_reason === "owner_takeover";
      return byOwner ? "owner" : "needs_you";
    }
    return openLeadContactIds.has(c.id) ? "ai" : "off";
  }

  const activeId = params.contact ?? contacts?.[0]?.id;
  const active = contacts?.find((c) => c.id === activeId) ?? null;

  const [{ data: messages }, { data: savedReplies }] = await Promise.all([
    activeId
      ? supabase
          .from("messages")
          .select("*")
          .eq("client_id", client.id)
          .eq("contact_id", activeId)
          .order("created_at", { ascending: true })
          .limit(200)
      : Promise.resolve({ data: [] as never[] }),
    supabase
      .from("saved_replies")
      .select("id, title, body")
      .eq("client_id", client.id)
      .order("created_at", { ascending: true }),
  ]);

  return (
    <div>
      <header className="px-4">
        <p className="text-xs uppercase tracking-[0.2em] text-copper">Inbox</p>
        <h1 className="mt-1 font-display text-3xl">Messages</h1>
      </header>

      {!contacts?.length ? (
        <div className="m-4 rounded-xl border border-dashed border-charcoal/20 p-6 text-center">
          <p className="font-display text-xl">No conversations yet</p>
          <p className="mt-2 text-sm text-charcoal/60">
            New website leads and texts will show up here automatically.
          </p>
          <Link href="/leads?new=1" className="mt-4 inline-block text-sm text-copper">
            Add a lead →
          </Link>
        </div>
      ) : (
        <div className="mt-3 grid gap-3 md:grid-cols-[200px_1fr]">
          <ul className="max-h-40 space-y-1 overflow-y-auto px-4 md:max-h-[70dvh]">
            {contacts.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/inbox?contact=${c.id}`}
                  className={`block rounded-md px-3 py-2 text-sm ${c.id === activeId ? "bg-copper/15 text-copper" : "bg-white/70"}`}
                >
                  {c.name}
                  {aiStateFor(c) === "ai" ? (
                    <span className="ml-1 rounded bg-charcoal/10 px-1 py-0.5 text-[10px] text-charcoal/60">
                      AI handling
                    </span>
                  ) : null}
                  {aiStateFor(c) === "needs_you" ? (
                    <span className="ml-1 rounded bg-red-100 px-1 py-0.5 text-[10px] text-red-700">
                      Needs you
                    </span>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
          {active ? (
            <InboxThread
              contactId={active.id}
              contactName={active.name}
              businessName={client.business_name ?? "us"}
              phone={active.phones?.[0]}
              email={active.emails?.[0]}
              bookingLink={
                client.site_key
                  ? `${getAppUrl()}/book/${client.site_key}`
                  : null
              }
              reviewLink={client.google_review_url}
              aiState={aiStateFor(active)}
              messages={messages ?? []}
              savedReplies={savedReplies ?? []}
            />
          ) : null}
        </div>
      )}
    </div>
  );
}
