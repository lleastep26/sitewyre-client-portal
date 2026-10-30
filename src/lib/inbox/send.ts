import type { SupabaseClient } from "@supabase/supabase-js";
import { getEmailProvider, getSmsProvider } from "@/lib/adapters";
import type { ClientRow, Database } from "@/lib/supabase/types";

export type SendInboxInput = {
  contactId: string;
  channel: "sms" | "email" | "note";
  body: string;
  email?: string | null;
  phone?: string | null;
};

export async function sendInboxMessageForClient(
  supabase: SupabaseClient<Database>,
  client: ClientRow,
  input: SendInboxInput,
): Promise<{ ok: true } | { error: string }> {
  const body = input.body.trim();
  if (!body) return { error: "Message body required" };
  if (!input.contactId) return { error: "Contact required" };

  const { data: contact, error: contactErr } = await supabase
    .from("contacts")
    .select("id, phones, emails, sms_opt_in")
    .eq("id", input.contactId)
    .eq("client_id", client.id)
    .maybeSingle();
  if (contactErr) return { error: contactErr.message };
  if (!contact) return { error: "Contact not found" };

  const phone =
    input.phone?.trim() ||
    (contact.phones?.[0] ? String(contact.phones[0]) : null);
  const email =
    input.email?.trim() ||
    (contact.emails?.[0] ? String(contact.emails[0]) : null);

  if (input.channel === "sms") {
    if (!phone || !client.twilio_phone_number) {
      return { error: "SMS not available" };
    }
    if (contact.sms_opt_in === false) {
      return { error: "Contact opted out of SMS" };
    }
    await getSmsProvider().send({
      to: phone,
      from: client.twilio_phone_number,
      body,
    });
  }

  if (input.channel === "email") {
    if (!email) return { error: "Email not available" };
    await getEmailProvider().send({
      to: email,
      subject: `Message from ${client.business_name ?? "your contractor"}`,
      html: `<p>${body}</p>`,
      text: body,
    });
  }

  const { error } = await supabase.from("messages").insert({
    client_id: client.id,
    contact_id: input.contactId,
    channel: input.channel,
    direction: input.channel === "note" ? "internal" : "outbound",
    body,
    status: "sent",
  });
  if (error) return { error: error.message };

  await supabase
    .from("leads")
    .update({
      first_response_at: new Date().toISOString(),
      last_activity_at: new Date().toISOString(),
    })
    .eq("contact_id", input.contactId)
    .eq("client_id", client.id)
    .is("first_response_at", null);

  return { ok: true };
}
