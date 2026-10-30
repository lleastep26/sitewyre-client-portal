import Link from "next/link";
import { requireMembership } from "@/lib/auth/session";
import { createQuote } from "./actions";
import { QuoteActions } from "./quote-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default async function QuotesPage({
  searchParams,
}: {
  searchParams: Promise<{ new?: string }>;
}) {
  const params = await searchParams;
  const { supabase, client } = await requireMembership();
  if (!client) return null;

  const [{ data: quotes }, { data: contacts }] = await Promise.all([
    supabase
      .from("quotes")
      .select("*")
      .eq("client_id", client.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("contacts")
      .select("id, name")
      .eq("client_id", client.id)
      .limit(50),
  ]);

  return (
    <div className="space-y-4 px-4">
      <header>
        <p className="text-xs uppercase tracking-[0.2em] text-copper">Quotes</p>
        <h1 className="mt-1 font-display text-3xl">Estimates</h1>
      </header>

      {params.new ? (
        <form action={async (fd) => { await createQuote(fd); }} className="space-y-2 rounded-xl border bg-white p-4">
          <select
            name="contact_id"
            className="h-11 w-full rounded-md border border-charcoal/20 px-3"
          >
            <option value="">Contact (optional)</option>
            {(contacts ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <Input name="line_name" placeholder="Line item" defaultValue="Service" />
          <Input name="qty" type="number" defaultValue="1" />
          <Input name="price" type="number" step="0.01" placeholder="Price" />
          <Button type="submit" className="w-full">
            Create quote
          </Button>
        </form>
      ) : null}

      <ul className="space-y-2">
        {(quotes ?? []).map((q) => (
          <li key={q.id} className="rounded-lg border bg-white p-3">
            <p className="font-medium">
              {q.number} · ${Number(q.total).toLocaleString()}
            </p>
            <p className="text-xs text-charcoal/60">{q.status}</p>
            <QuoteActions quoteId={q.id} publicToken={q.public_token} />
          </li>
        ))}
        {!quotes?.length ? (
          <div className="rounded-xl border border-dashed p-6 text-center">
            <p className="font-display text-xl">No quotes yet</p>
            <Link href="/quotes?new=1" className="mt-3 inline-block text-sm text-copper">
              Build a quote →
            </Link>
          </div>
        ) : null}
      </ul>
    </div>
  );
}
