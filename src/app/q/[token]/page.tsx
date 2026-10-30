import { createAdminClient } from "@/lib/supabase/admin";
import { approveQuote } from "./actions";
import { Button } from "@/components/ui/button";
import type { ClientRow, QuoteRow } from "@/lib/supabase/types";

export default async function PublicQuotePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("quotes")
    .select("*")
    .eq("public_token", token)
    .maybeSingle();

  const quote = data as QuoteRow | null;
  if (!quote) {
    return <main className="p-6">Quote not found.</main>;
  }

  const { data: clientData } = await supabase
    .from("clients")
    .select("business_name, brand_colors")
    .eq("id", quote.client_id)
    .maybeSingle();
  const client = clientData as Pick<ClientRow, "business_name" | "brand_colors"> | null;
  const items = quote.line_items;

  return (
    <main className="mx-auto min-h-dvh max-w-lg bg-[radial-gradient(ellipse_at_top,_#fbf7f2,_#e8dccb)] px-4 py-10">
      <p className="text-xs uppercase tracking-[0.2em] text-copper">
        {client?.business_name ?? "Quote"}
      </p>
      <h1 className="mt-2 font-display text-4xl text-charcoal">{quote.number}</h1>
      <p className="mt-1 text-sm text-charcoal/60">Status: {quote.status}</p>
      <ul className="mt-6 space-y-2">
        {items.map((item, i) => (
          <li key={i} className="flex justify-between rounded-lg bg-white/80 p-3 text-sm">
            <span>
              {item.name} × {item.qty}
            </span>
            <span>${(item.qty * item.price).toFixed(2)}</span>
          </li>
        ))}
      </ul>
      <p className="mt-4 font-display text-2xl">
        Total ${Number(quote.total).toFixed(2)}
      </p>
      {quote.status !== "accepted" ? (
        <form
          action={async () => {
            "use server";
            await approveQuote(token);
          }}
          className="mt-6"
        >
          <Button className="w-full" type="submit">
            Approve & e-sign
          </Button>
        </form>
      ) : (
        <p className="mt-6 text-sm text-copper">Approved. Thank you!</p>
      )}
    </main>
  );
}
