import type { ReactNode } from "react";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getPaymentsProvider,
  isReusablePaymentIntentStatus,
} from "@/lib/adapters/payments";
import { getAppUrl } from "@/lib/supabase/env";
import type { ClientRow, InvoiceRow } from "@/lib/supabase/types";
import { PaymentForm } from "./payment-form";

export default async function PayPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ paid?: string }>;
}) {
  const { token } = await params;
  const { paid } = await searchParams;
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
  const amountCents = Math.round(remaining * 100);
  const amountLabel = `$${remaining.toFixed(2)}`;
  const returnUrl = `${getAppUrl()}/pay/${token}?paid=1`;
  const showPaid =
    invoice.status === "paid" || remaining <= 0 || paid === "1";

  let clientSecret: string | null = null;
  let payBlockedReason: string | null = null;

  if (!showPaid) {
    if (!client?.stripe_connect_account_id) {
      payBlockedReason =
        "Online card pay requires the contractor to finish Stripe Connect onboarding.";
    } else if (!process.env.STRIPE_SECRET_KEY) {
      payBlockedReason = "Card payments are not configured on this environment.";
    } else {
      const payments = getPaymentsProvider();
      let intentId = invoice.stripe_payment_intent_id;

      if (intentId) {
        const existing = await payments.retrievePaymentIntent(intentId);
        if (
          existing &&
          isReusablePaymentIntentStatus(existing.status) &&
          existing.amountCents === amountCents &&
          existing.clientSecret
        ) {
          clientSecret = existing.clientSecret;
        } else if (existing?.status === "succeeded") {
          // Webhook may still be catching up; treat as paid UI.
          return (
            <PayShell
              businessName={client?.business_name}
              invoiceNumber={invoice.number}
              amountLabel={amountLabel}
              status="paid"
            >
              <p className="mt-6 text-copper">Paid in full. Thank you!</p>
            </PayShell>
          );
        } else {
          intentId = null;
        }
      }

      if (!clientSecret) {
        const intent = await payments.createPaymentIntent({
          amountCents,
          connectedAccountId: client.stripe_connect_account_id,
          metadata: {
            invoice_id: invoice.id,
            client_id: invoice.client_id,
          },
        });
        clientSecret = intent.clientSecret || null;
        await supabase
          .from("invoices")
          .update({ stripe_payment_intent_id: intent.id })
          .eq("id", invoice.id);
      }
    }
  }

  return (
    <PayShell
      businessName={client?.business_name}
      invoiceNumber={invoice.number}
      amountLabel={amountLabel}
      status={invoice.status}
    >
      {showPaid ? (
        <p className="mt-6 text-copper">
          {paid === "1" && invoice.status !== "paid"
            ? "Payment submitted. This invoice will show paid once confirmed."
            : "Paid in full. Thank you!"}
        </p>
      ) : clientSecret ? (
        <PaymentForm
          clientSecret={clientSecret}
          returnUrl={returnUrl}
          amountLabel={amountLabel}
        />
      ) : (
        <p className="mt-6 text-sm text-charcoal/70">
          {payBlockedReason ?? "Unable to start card payment."}
        </p>
      )}
    </PayShell>
  );
}

function PayShell({
  businessName,
  invoiceNumber,
  amountLabel,
  status,
  children,
}: {
  businessName?: string | null;
  invoiceNumber: string;
  amountLabel: string;
  status: string;
  children: ReactNode;
}) {
  return (
    <main className="mx-auto min-h-dvh max-w-lg bg-[radial-gradient(ellipse_at_top,_#fbf7f2,_#e8dccb)] px-4 py-10">
      <p className="text-xs uppercase tracking-[0.22em] text-copper">
        {businessName ?? "Invoice"}
      </p>
      <h1 className="mt-2 font-display text-4xl text-charcoal">{invoiceNumber}</h1>
      <p className="mt-2 text-lg text-charcoal">
        Due {amountLabel} · {status}
      </p>
      {children}
    </main>
  );
}
