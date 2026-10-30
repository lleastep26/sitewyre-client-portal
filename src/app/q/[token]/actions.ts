"use server";

import { nanoid } from "nanoid";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAppUrl } from "@/lib/supabase/env";

export async function approveQuote(token: string, formData: FormData) {
  const signerName = String(formData.get("signer_name") ?? "").trim();
  if (!signerName) {
    return { error: "Type your full name to sign" };
  }

  const supabase = createAdminClient();
  const { data: quote } = await supabase
    .from("quotes")
    .select("*")
    .eq("public_token", token)
    .single();
  if (!quote) return { error: "Quote not found" };
  if (quote.status === "accepted") {
    return { ok: true, already: true };
  }

  const options = {
    ...((quote.options as Record<string, unknown> | null) ?? {}),
    signer_name: signerName,
    signed_via: "public_quote",
  };

  await supabase
    .from("quotes")
    .update({
      status: "accepted",
      signed_at: new Date().toISOString(),
      options,
    })
    .eq("id", quote.id);

  const total = Number(quote.total) || 0;
  const deposit = Math.round(total * 0.2 * 100) / 100;
  let payUrl: string | null = null;

  if (deposit > 0) {
    const { count } = await supabase
      .from("invoices")
      .select("*", { count: "exact", head: true })
      .eq("client_id", quote.client_id);
    const number = `INV-${String((count ?? 0) + 1).padStart(4, "0")}`;
    const publicToken = nanoid(24);
    const { data: invoice, error } = await supabase
      .from("invoices")
      .insert({
        client_id: quote.client_id,
        contact_id: quote.contact_id,
        number,
        line_items: [
          {
            name: `Deposit for ${quote.number}`,
            qty: 1,
            price: deposit,
          },
        ],
        total: deposit,
        amount_paid: 0,
        status: "open",
        public_token: publicToken,
        due_at: new Date(Date.now() + 7 * 86400000).toISOString(),
      })
      .select("public_token")
      .single();

    if (!error && invoice) {
      payUrl = `${getAppUrl()}/pay/${invoice.public_token}`;
      await supabase
        .from("quotes")
        .update({
          options: {
            ...options,
            deposit_invoice_token: invoice.public_token,
            deposit_amount: deposit,
          },
        })
        .eq("id", quote.id);
    }
  }

  await supabase.from("workflow_runs").insert({
    client_id: quote.client_id,
    trigger: "quote_accepted",
    status: "sent",
    log: { quoteId: quote.id, signerName, deposit, payUrl },
  });

  revalidatePath(`/q/${token}`);
  return { ok: true, payUrl };
}
