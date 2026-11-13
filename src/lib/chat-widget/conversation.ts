import type { SupabaseClient } from "@supabase/supabase-js";
import type { ChatSessionRow, ClientRow, Database } from "@/lib/supabase/types";
import { getSmsProvider } from "@/lib/adapters";
import { resolveSmsFrom } from "@/lib/a2p/sending";
import { loadBusinessKnowledgeParts } from "@/lib/business-knowledge/load";
import {
  buildBusinessKnowledgeSummary,
  buildChatWidgetPrompt,
} from "@/lib/business-knowledge/summary";
import { AI_CHAT_MODEL } from "@/lib/integrations/anthropic";
import { sendPushToClient } from "@/lib/push/web-push";
import { getAppUrl } from "@/lib/supabase/env";
import { normalizePhone } from "@/lib/utils";
import { runChatAssistant, type ChatTurn } from "./assistant";
import { CHAT_DAILY_REPLY_CAP } from "./limits";

type Admin = SupabaseClient<Database>;

export const CHAT_FOLLOW_UP_TEXT =
  "Thanks — I've passed this to the team and someone will follow up with you shortly.";

/**
 * Handles one visitor message in a website chat: saves it to the lead's
 * thread, answers it from the Business knowledge summary (or says the team
 * will follow up and alerts the owner once per conversation), saves the
 * answer, and counts it.
 */
export async function answerChatMessage(
  supabase: Admin,
  opts: {
    client: ClientRow;
    session: Pick<ChatSessionRow, "id" | "contact_id" | "lead_id" | "created_at" | "owner_alerted_at" | "visitor_message_count">;
    visitorName: string;
    visitorMessage: string;
  },
): Promise<{ reply: string }> {
  const { client, session } = opts;
  const now = new Date();

  await supabase.from("messages").insert({
    client_id: client.id,
    contact_id: session.contact_id,
    channel: "chat",
    direction: "inbound",
    body: opts.visitorMessage,
    status: "received",
  });
  await supabase
    .from("chat_sessions")
    .update({
      visitor_message_count: session.visitor_message_count + 1,
      last_message_at: now.toISOString(),
    })
    .eq("id", session.id);

  // Per-client daily ceiling on AI replies, so a flood on one site can't
  // run up a bill. Past it, visitors get the follow-up line without a
  // model call.
  const { count: repliesToday } = await supabase
    .from("messages")
    .select("*", { count: "exact", head: true })
    .eq("client_id", client.id)
    .eq("channel", "chat")
    .eq("ai_generated", true)
    .gte("created_at", new Date(now.getTime() - 86_400_000).toISOString());

  let reply = CHAT_FOLLOW_UP_TEXT;
  let needsOwner: string | null = null;
  let usage = { inputTokens: 0, outputTokens: 0 };

  if ((repliesToday ?? 0) >= CHAT_DAILY_REPLY_CAP) {
    needsOwner = "The chat widget reached its daily AI reply limit.";
  } else {
    const { data: rows } = await supabase
      .from("messages")
      .select("direction, body")
      .eq("client_id", client.id)
      .eq("contact_id", session.contact_id)
      .eq("channel", "chat")
      .gte("created_at", session.created_at)
      .order("created_at", { ascending: true })
      .limit(80);
    const history: ChatTurn[] = (rows ?? []).map((m) => ({
      role: m.direction === "inbound" ? "visitor" : "assistant",
      body: m.body ?? "",
    }));

    const timeZone = client.timezone ?? "America/Chicago";
    const knowledgeInput = { client, ...(await loadBusinessKnowledgeParts(supabase, client.id)) };
    const contextNote = [
      `Current date and time for the business: ${now.toLocaleString("en-US", {
        timeZone,
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })} (${timeZone}).`,
      `Visitor's name: ${opts.visitorName}.`,
      client.site_key ? `Booking page link: ${getAppUrl()}/book/${client.site_key}` : null,
    ]
      .filter(Boolean)
      .join("\n");

    const outcome = await runChatAssistant({
      systemPrompt: buildChatWidgetPrompt(knowledgeInput),
      contextNote,
      history,
      allowedTimeText: [buildBusinessKnowledgeSummary(knowledgeInput), ...history.map((t) => t.body)].join("\n"),
    });
    usage = { inputTokens: outcome.inputTokens, outputTokens: outcome.outputTokens };
    if (outcome.kind === "reply") reply = outcome.text;
    else needsOwner = outcome.summary;
  }

  await supabase.from("messages").insert({
    client_id: client.id,
    contact_id: session.contact_id,
    channel: "chat",
    direction: "outbound",
    body: reply,
    status: "sent",
    ai_generated: true,
  });
  await supabase
    .from("clients")
    .update({ ai_chat_replies_used_this_month: (client.ai_chat_replies_used_this_month ?? 0) + 1 })
    .eq("id", client.id);
  await supabase.from("workflow_runs").insert({
    client_id: client.id,
    trigger: "chat_widget",
    status: needsOwner ? "follow_up" : "reply",
    log: {
      leadId: session.lead_id,
      contactId: session.contact_id,
      model: AI_CHAT_MODEL,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      ...(needsOwner ? { summary: needsOwner } : {}),
    },
  });

  // One owner alert per conversation, however many questions go unanswered.
  if (needsOwner && !session.owner_alerted_at) {
    await supabase
      .from("chat_sessions")
      .update({ owner_alerted_at: now.toISOString() })
      .eq("id", session.id);
    const alert = `${opts.visitorName} is chatting on your website and needs you: "${opts.visitorMessage.slice(0, 100)}" — see your portal inbox.`;
    const from = resolveSmsFrom(client);
    if (client.phone && from) {
      await getSmsProvider()
        .send({ to: normalizePhone(client.phone), from, body: alert })
        .catch(() => undefined);
    }
    await sendPushToClient(client.id, {
      title: `Website chat — ${opts.visitorName}`,
      body: alert.slice(0, 160),
      url: `/inbox?contact=${session.contact_id}`,
    }).catch(() => undefined);
  }

  return { reply };
}
