"use server";

import { nanoid } from "nanoid";
import { revalidatePath } from "next/cache";
import { requireMembership } from "@/lib/auth/session";
import { getPaymentsProvider, getEmailProvider, getSmsProvider } from "@/lib/adapters";
import { getAppUrl } from "@/lib/supabase/env";
import { inngest } from "@/lib/inngest/client";

export async function createInvoice(formData: FormData) {
  const { supabase, client } = await requireMembership();
  if (!client) return { error: "No client" };

  const jobId = String(formData.get("job_id") ?? "") || null;
  const total = Number(formData.get("total") ?? 0);
  const publicToken = nanoid(24);
  const { count } = await supabase
    .from("invoices")
    .select("*", { count: "exact", head: true })
    .eq("client_id", client.id);
  const number = `INV-${String((count ?? 0) + 1).padStart(4, "0")}`;

  let contactId: string | null = null;
  let lineItems = [{ name: "Services", qty: 1, price: total }];
  if (jobId) {
    const { data: job } = await supabase
      .from("jobs")
      .select("*")
      .eq("id", jobId)
      .eq("client_id", client.id)
      .maybeSingle();
    contactId = job?.contact_id ?? null;
    if (job?.quote_id) {
      const { data: quote } = await supabase
        .from("quotes")
        .select("line_items, total")
        .eq("id", job.quote_id)
        .maybeSingle();
      if (quote) {
        lineItems = quote.line_items as typeof lineItems;
      }
    }
  }

  const { data, error } = await supabase
    .from("invoices")
    .insert({
      client_id: client.id,
      job_id: jobId,
      contact_id: contactId,
      number,
      line_items: lineItems,
      total: total || lineItems.reduce((s, i) => s + i.qty * i.price, 0),
      amount_paid: 0,
      status: "open",
      public_token: publicToken,
      due_at: new Date(Date.now() + 7 * 86400000).toISOString(),
    })
    .select("*")
    .single();

  if (error) return { error: error.message };
  revalidatePath("/invoices");
  return { ok: true, id: data.id, token: publicToken };
}

export async function sendInvoice(invoiceId: string) {
  const { supabase, client } = await requireMembership();
  if (!client) return { error: "No client" };
  const { data: invoice } = await supabase
    .from("invoices")
    .select("*")
    .eq("id", invoiceId)
    .single();
  if (!invoice) return { error: "Not found" };

  const link = `${getAppUrl()}/pay/${invoice.public_token}`;
  let contact: { phones?: string[]; emails?: string[] } | null = null;
  if (invoice.contact_id) {
    const { data } = await supabase
      .from("contacts")
      .select("phones, emails")
      .eq("id", invoice.contact_id)
      .maybeSingle();
    contact = data;
  }

  if (contact?.emails?.[0]) {
    await getEmailProvider().send({
      to: contact.emails[0],
      subject: `Invoice ${invoice.number}`,
      html: `<p>Pay online: <a href="${link}">${link}</a></p>`,
    });
  }
  if (contact?.phones?.[0] && client.twilio_phone_number) {
    await getSmsProvider().send({
      to: contact.phones[0],
      from: client.twilio_phone_number,
      body: `Invoice ${invoice.number} from ${client.business_name}: ${link}`,
    });
  }

  const reminderTo = contact?.emails?.[0];
  if (reminderTo) {
    await inngest
      .send({
        name: "portal/invoice.reminder",
        data: {
          to: reminderTo,
          subject: `Reminder: invoice ${invoice.number}`,
          html: `<p>Payment due: <a href="${link}">${link}</a></p>`,
        },
      })
      .catch(() => undefined);
  }

  revalidatePath("/invoices");
  return { ok: true, link };
}

export async function recordManualPayment(input: {
  invoiceId: string;
  amount: number;
  method: string;
}) {
  const { supabase, client } = await requireMembership();
  if (!client) return { error: "No client" };
  const { data: invoice } = await supabase
    .from("invoices")
    .select("*")
    .eq("id", input.invoiceId)
    .eq("client_id", client.id)
    .single();
  if (!invoice) return { error: "Not found" };
  const paid = Number(invoice.amount_paid) + input.amount;
  await supabase
    .from("invoices")
    .update({
      amount_paid: paid,
      status: paid >= Number(invoice.total) ? "paid" : "partial",
    })
    .eq("id", invoice.id);
  if (invoice.contact_id) {
    await supabase.from("activities").insert({
      client_id: client.id,
      contact_id: invoice.contact_id,
      type: "payment_recorded",
      payload: { method: input.method, amount: input.amount, invoiceId: invoice.id },
      occurred_at: new Date().toISOString(),
    });
  }
  revalidatePath("/invoices");
  return { ok: true };
}

export async function createCardPayment(invoiceId: string) {
  const { supabase, client } = await requireMembership();
  if (!client?.stripe_connect_account_id) {
    return { error: "Connect Stripe in Settings first" };
  }
  const { data: invoice } = await supabase
    .from("invoices")
    .select("*")
    .eq("id", invoiceId)
    .eq("client_id", client.id)
    .single();
  if (!invoice) return { error: "Not found" };

  const remaining = Math.max(0, Number(invoice.total) - Number(invoice.amount_paid));
  const intent = await getPaymentsProvider().createPaymentIntent({
    amountCents: Math.round(remaining * 100),
    connectedAccountId: client.stripe_connect_account_id,
    metadata: { invoice_id: invoice.id, client_id: client.id },
  });
  await supabase
    .from("invoices")
    .update({ stripe_payment_intent_id: intent.id })
    .eq("id", invoice.id);
  return { ok: true, clientSecret: intent.clientSecret };
}
