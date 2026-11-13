"use server";

import { revalidatePath } from "next/cache";
import { requireMembership } from "@/lib/auth/session";
import { getAiProvider } from "@/lib/adapters";
import { sendInboxMessageForClient } from "@/lib/inbox/send";
import { inngest } from "@/lib/inngest/client";
import { AI_HANDED_BACK_ACTIVITY } from "@/lib/assistant/constants";

const DEFAULT_REPLIES = [
  {
    title: "Thanks — we'll call",
    body: "Hi {{first_name}}, thanks for reaching out to {{business_name}}. We'll call you shortly.",
  },
  {
    title: "Schedule link",
    body: "Hi {{first_name}}, book with {{business_name}} here: {{booking_link}}",
  },
  {
    title: "Review ask",
    body: "Hi {{first_name}}, thanks again from {{business_name}} — leave a review if you can: {{review_link}}",
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

  const result = await sendInboxMessageForClient(supabase, client, input);
  if ("error" in result) return { error: result.error };

  // The owner texting the customer themselves means they've taken the
  // thread over — the AI stops answering it until it's handed back.
  if (input.channel === "sms" && client.ai_text_assistant_enabled) {
    await pauseAiThread(supabase, client.id, input.contactId, "owner_replied");
  }

  revalidatePath("/inbox");
  return { ok: true as const };
}

async function pauseAiThread(
  supabase: Awaited<ReturnType<typeof requireMembership>>["supabase"],
  clientId: string,
  contactId: string,
  reason: string,
) {
  await supabase
    .from("contacts")
    .update({ ai_paused_at: new Date().toISOString(), ai_paused_reason: reason })
    .eq("id", contactId)
    .eq("client_id", clientId);
  // Cancels a reply the AI may still be waiting to send on this thread.
  await inngest
    .send({ name: "portal/ai-text.paused", data: { clientId, contactId } })
    .catch(() => undefined);
}

export async function takeOverThread(contactId: string) {
  const { supabase, client } = await requireMembership();
  if (!client) return { error: "No client" };
  if (!contactId) return { error: "Contact required" };
  await pauseAiThread(supabase, client.id, contactId, "owner_takeover");
  revalidatePath("/inbox");
  return { ok: true as const };
}

export async function handBackToAi(contactId: string) {
  const { supabase, client } = await requireMembership();
  if (!client) return { error: "No client" };
  if (!contactId) return { error: "Contact required" };
  const { error } = await supabase
    .from("contacts")
    .update({ ai_paused_at: null, ai_paused_reason: null })
    .eq("id", contactId)
    .eq("client_id", client.id);
  if (error) return { error: error.message };
  // Marks the moment of hand-back: the AI's eight-reply cap counts from here.
  await supabase.from("activities").insert({
    client_id: client.id,
    contact_id: contactId,
    type: AI_HANDED_BACK_ACTIVITY,
    payload: {},
  });
  revalidatePath("/inbox");
  return { ok: true as const };
}

export async function suggestReply(context: string) {
  const ai = getAiProvider();
  return { suggestion: await ai.suggestReply(context) };
}
