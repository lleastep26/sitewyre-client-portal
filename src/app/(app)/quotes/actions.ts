"use server";

import { nanoid } from "nanoid";
import { revalidatePath } from "next/cache";
import { requireMembership } from "@/lib/auth/session";
import { getEmailProvider, getSmsProvider } from "@/lib/adapters";
import { getAppUrl } from "@/lib/supabase/env";
import { inngest } from "@/lib/inngest/client";

export async function createQuote(formData: FormData) {
  const { supabase, client } = await requireMembership();
  if (!client) return { error: "No client" };

  const contactId = String(formData.get("contact_id") ?? "") || null;
  const name = String(formData.get("line_name") ?? "Service");
  const price = Number(formData.get("price") ?? 0);
  const qty = Number(formData.get("qty") ?? 1);
  const total = price * qty;
  const publicToken = nanoid(24);

  const { count } = await supabase
    .from("quotes")
    .select("*", { count: "exact", head: true })
    .eq("client_id", client.id);

  const number = `Q-${String((count ?? 0) + 1).padStart(4, "0")}`;

  const { data, error } = await supabase
    .from("quotes")
    .insert({
      client_id: client.id,
      contact_id: contactId,
      number,
      line_items: [{ name, qty, price }],
      total,
      status: "draft",
      public_token: publicToken,
      expires_at: new Date(Date.now() + 14 * 86400000).toISOString(),
    })
    .select("*")
    .single();

  if (error) return { error: error.message };
  revalidatePath("/quotes");
  return { ok: true, id: data.id, token: publicToken };
}

export async function sendQuote(quoteId: string) {
  const { supabase, client } = await requireMembership();
  if (!client) return { error: "No client" };

  const { data: quote } = await supabase
    .from("quotes")
    .select("*")
    .eq("id", quoteId)
    .eq("client_id", client.id)
    .single();

  if (!quote) return { error: "Not found" };

  const link = `${getAppUrl()}/q/${quote.public_token}`;
  let contact: { name?: string; phones?: string[]; emails?: string[] } | null = null;
  if (quote.contact_id) {
    const { data } = await supabase
      .from("contacts")
      .select("name, phones, emails")
      .eq("id", quote.contact_id)
      .maybeSingle();
    contact = data;
  }

  if (contact?.phones?.[0] && client.twilio_phone_number) {
    await getSmsProvider().send({
      to: contact.phones[0],
      from: client.twilio_phone_number,
      body: `Your quote from ${client.business_name}: ${link}`,
    });
  }
  if (contact?.emails?.[0]) {
    await getEmailProvider().send({
      to: contact.emails[0],
      subject: `Quote ${quote.number} from ${client.business_name}`,
      html: `<p>View and approve your quote:</p><p><a href="${link}">${link}</a></p>`,
    });
  }

  await supabase.from("quotes").update({ status: "sent" }).eq("id", quoteId);

  await inngest
    .send({
      name: "portal/quote.sent",
      data: { quoteId, clientId: client.id },
    })
    .catch(() => undefined);

  await supabase.from("workflow_runs").insert({
    client_id: client.id,
    trigger: "quote_sent",
    status: "sent",
    log: { quoteId, link },
  });

  revalidatePath("/quotes");
  return { ok: true, link };
}

export async function convertQuoteToJob(quoteId: string) {
  const { supabase, client, user } = await requireMembership();
  if (!client) return { error: "No client" };
  const { data: quote } = await supabase
    .from("quotes")
    .select("*")
    .eq("id", quoteId)
    .eq("client_id", client.id)
    .single();
  if (!quote) return { error: "Not found" };

  const { data: job, error } = await supabase
    .from("jobs")
    .insert({
      client_id: client.id,
      contact_id: quote.contact_id,
      quote_id: quote.id,
      status: "scheduled",
      assignee_ids: [user.id],
      notes: `From quote ${quote.number}`,
      checklist: [],
    })
    .select("id")
    .single();
  if (error) return { error: error.message };
  await supabase.from("quotes").update({ status: "accepted" }).eq("id", quoteId);
  revalidatePath("/quotes");
  revalidatePath("/jobs");
  return { ok: true, jobId: job.id };
}
