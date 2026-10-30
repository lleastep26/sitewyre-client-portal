import Link from "next/link";
import { requireMembership } from "@/lib/auth/session";
import { InboxThread } from "@/components/inbox/thread";
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
    .select("id, name, phones, emails")
    .eq("client_id", client.id)
    .order("updated_at", { ascending: false })
    .limit(40);

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
              messages={messages ?? []}
              savedReplies={savedReplies ?? []}
            />
          ) : null}
        </div>
      )}
    </div>
  );
}
