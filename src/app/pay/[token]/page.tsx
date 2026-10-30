import { createAdminClient } from "@/lib/supabase/admin";
import { getPaymentsProvider } from "@/lib/adapters";
import type { ClientRow, InvoiceRow } from "@/lib/supabase/types";

export default async function PayPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("invoices")
    .select("*")
    .eq("public_token", token)
    .maybeSingle();

  const invoice = data as InvoiceRow | null;
  if (!invoice) return <main className="p-6">Invoice not found.</main>;

  const { data: clientData } = await supabase
    .from("clients")
    .select("business_name, stripe_connect_account_id")
    .eq("id", invoice.client_id)
    .maybeSingle();
  const client = clientData as Pick<
    ClientRow,
    "business_name" | "stripe_connect_account_id"
  > | null;

  const remaining = Math.max(
    0,
    Number(invoice.total) - Number(invoice.amount_paid),
  );

  let clientSecret: string | null = null;
  if (client?.stripe_connect_account_id && remaining > 0 && invoice.status !== "paid") {
    const intent = await getPaymentsProvider().createPaymentIntent({
      amountCents: Math.round(remaining * 100),
      connectedAccountId: client.stripe_connect_account_id,
      metadata: { invoice_id: invoice.id },
    });
    clientSecret = intent.clientSecret;
    await supabase
      .from("invoices")
      .update({ stripe_payment_intent_id: intent.id })
      .eq("id", invoice.id);
  }

  return (
    <main className="mx-auto min-h-dvh max-w-lg px-4 py-10">
      <p className="text-xs uppercase tracking-[0.2em] text-copper">
        {client?.business_name ?? "Invoice"}
      </p>
      <h1 className="mt-2 font-display text-4xl">{invoice.number}</h1>
      <p className="mt-2 text-lg">
        Due ${remaining.toFixed(2)} · {invoice.status}
      </p>
      {invoice.status === "paid" ? (
        <p className="mt-6 text-copper">Paid in full. Thank you!</p>
      ) : clientSecret ? (
        <p className="mt-6 text-sm text-charcoal/70">
          Card payment ready (PaymentIntent created). Embed Stripe Payment Element
          with client secret in production UI.
        </p>
      ) : (
        <p className="mt-6 text-sm text-charcoal/70">
          Online card pay requires the contractor to finish Stripe Connect onboarding.
        </p>
      )}
    </main>
  );
}
