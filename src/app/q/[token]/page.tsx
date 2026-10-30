import { createAdminClient } from "@/lib/supabase/admin";
import { approveQuote } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ClientRow, QuoteRow } from "@/lib/supabase/types";
import { getAppUrl } from "@/lib/supabase/env";

export default async function PublicQuotePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ paid?: string }>;
}) {
  const { token } = await params;
  await searchParams;
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
  const client = clientData as Pick<
    ClientRow,
    "business_name" | "brand_colors"
  > | null;
  const items = quote.line_items;
  const options = (quote.options as Record<string, unknown> | null) ?? {};
  const depositToken =
    typeof options.deposit_invoice_token === "string"
      ? options.deposit_invoice_token
      : null;
  const depositAmount =
    typeof options.deposit_amount === "number" ? options.deposit_amount : null;
  const signerName =
    typeof options.signer_name === "string" ? options.signer_name : null;
  const payUrl = depositToken ? `${getAppUrl()}/pay/${depositToken}` : null;
  const expired =
    quote.expires_at != null &&
    new Date(quote.expires_at).getTime() < Date.now() &&
    quote.status !== "accepted";

  return (
    <main className="mx-auto min-h-dvh max-w-lg bg-[radial-gradient(ellipse_at_top,_#fbf7f2,_#e8dccb)] px-4 py-10">
      <p className="text-xs uppercase tracking-[0.2em] text-copper">
        {client?.business_name ?? "Quote"}
      </p>
      <h1 className="mt-2 font-display text-4xl text-charcoal">{quote.number}</h1>
      <p className="mt-1 text-sm text-charcoal/60">Status: {quote.status}</p>
      <ul className="mt-6 space-y-2">
        {items.map((item, i) => (
          <li
            key={i}
            className="flex justify-between rounded-lg bg-white/80 p-3 text-sm"
          >
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
      {depositAmount != null ? (
        <p className="mt-1 text-sm text-charcoal/70">
          Deposit due: ${depositAmount.toFixed(2)} (20%)
        </p>
      ) : null}

      {quote.status === "accepted" ? (
        <div className="mt-6 space-y-3">
          <p className="text-sm text-copper">
            Approved{signerName ? ` by ${signerName}` : ""}. Thank you!
          </p>
          {payUrl ? (
            <a href={payUrl} className="inline-block text-sm text-copper underline">
              Pay deposit online →
            </a>
          ) : null}
        </div>
      ) : expired ? (
        <p className="mt-6 text-sm text-charcoal/70">This quote has expired.</p>
      ) : (
        <form
          action={async (fd) => {
            "use server";
            await approveQuote(token, fd);
          }}
          className="mt-6 space-y-3"
        >
          <label className="block text-sm text-charcoal/80">
            Type your full name to e-sign
            <Input
              name="signer_name"
              required
              placeholder="Full legal name"
              className="mt-1"
            />
          </label>
          <p className="text-xs text-charcoal/60">
            Approving creates a 20% deposit invoice you can pay online.
          </p>
          <Button className="w-full" type="submit">
            Approve & e-sign
          </Button>
        </form>
      )}
    </main>
  );
}
