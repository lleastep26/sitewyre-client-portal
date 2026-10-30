"use server";

import { revalidatePath } from "next/cache";
import { requireMembership } from "@/lib/auth/session";
import { getSmsProvider, getEmailProvider, getAiProvider } from "@/lib/adapters";

const DEFAULT_REPLIES = [
  {
    title: "Thanks — we'll call",
    body: "Hi {{first_name}}, thanks for reaching out to {{business_name}}. We'll call you shortly.",
  },
  {
    title: "Schedule link",
    body: "Hi {{first_name}}, you can book a time with {{business_name}} here — reply if you need help picking a slot.",
  },
  {
    title: "On my way",
    body: "Hi {{first_name}}, this is {{business_name}} — we're on the way.",
  },
];

export async function ensureSavedReplies() {
  const { supabase, client } = await requireMembership();
  if (!client) return { error: "No client" };
  const { count } = await supabase
    .from("saved_replies")
    .select("*", { count: "exact", head: true })
    .eq("client_id", client.id);
  if ((count ?? 0) > 0) return { ok: true };
  await supabase.from("saved_replies").insert(
    DEFAULT_REPLIES.map((r) => ({
      client_id: client.id,
      title: r.title,
      body: r.body,
    })),
  );
  revalidatePath("/inbox");
  return { ok: true };
}

export async function createSavedReply(formData: FormData) {
  const { supabase, client } = await requireMembership();
  if (!client) return { error: "No client" };
  const title = String(formData.get("title") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  if (!title || !body) return { error: "Title and body required" };
  const { error } = await supabase.from("saved_replies").insert({
    client_id: client.id,
    title,
    body,
  });
  if (error) return { error: error.message };
  revalidatePath("/inbox");
  return { ok: true };
}

export async function deleteSavedReply(id: string) {
  const { supabase, client } = await requireMembership();
  if (!client) return { error: "No client" };
  const { error } = await supabase
    .from("saved_replies")
    .delete()
    .eq("id", id)
    .eq("client_id", client.id);
  if (error) return { error: error.message };
  revalidatePath("/inbox");
  return { ok: true };
}

export async function sendInboxMessage(input: {
  contactId: string;
  channel: "sms" | "email" | "note";
  body: string;
  email?: string | null;
  phone?: string | null;
}) {
  const { supabase, client } = await requireMembership();
  if (!client) return { error: "No client" };

  if (input.channel === "sms") {
    if (!input.phone || !client.twilio_phone_number) {
      return { error: "SMS not available" };
    }
    const { data: contact } = await supabase
      .from("contacts")
      .select("sms_opt_in")
      .eq("id", input.contactId)
      .single();
    if (contact && contact.sms_opt_in === false) {
      return { error: "Contact opted out of SMS" };
    }
    await getSmsProvider().send({
      to: input.phone,
      from: client.twilio_phone_number,
      body: input.body,
    });
  }

  if (input.channel === "email" && input.email) {
    await getEmailProvider().send({
      to: input.email,
      subject: `Message from ${client.business_name ?? "your contractor"}`,
      html: `<p>${input.body}</p>`,
      text: input.body,
    });
  }

  const { error } = await supabase.from("messages").insert({
    client_id: client.id,
    contact_id: input.contactId,
    channel: input.channel,
    direction: input.channel === "note" ? "internal" : "outbound",
    body: input.body,
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

  revalidatePath("/inbox");
  return { ok: true };
}

export async function suggestReply(context: string) {
  const ai = getAiProvider();
  return { suggestion: await ai.suggestReply(context) };
}
