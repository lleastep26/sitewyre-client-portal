import type { SupabaseClient } from "@supabase/supabase-js";
import type { ClientRow, Database } from "@/lib/supabase/types";
import { getSmsProvider } from "@/lib/adapters";
import { resolveOwnerAlertFrom, resolveSmsFrom } from "@/lib/a2p/sending";
import { checkA2pGate } from "@/lib/funnels/a2p-gate";
import { isOptedOut } from "@/lib/funnels/opt-out";
import { sendFunnelMessage } from "@/lib/funnels/send";
import { findOpenLeadForPhone } from "@/lib/leads/lifecycle";
import { sendPushToClient } from "@/lib/push/web-push";
import { nextSendableAt } from "@/lib/scheduling/quiet-hours";
import { normalizePhone } from "@/lib/utils";
import { loadBusinessKnowledgeParts } from "@/lib/business-knowledge/load";
import {
  buildBusinessKnowledgeSummary,
  buildTextAssistantPrompt,
} from "@/lib/business-knowledge/summary";
import { bookAppointmentForCustomer, checkAvailabilityForService } from "./booking";
import { AI_HANDED_BACK_ACTIVITY } from "./constants";
import { detectHandoffKeyword, type HandoffReason } from "./guards";
import { runTextAssistant, type AssistantOutcome, type ThreadMessage } from "./text-assistant";

type Admin = SupabaseClient<Database>;

/** A lead who texted in the last 15 minutes is live on their phone. */
export const AI_LIVE_WINDOW_MS = 15 * 60_000;

/** After this many AI replies without a booking, a person should look. */
export const AI_REPLY_CAP = 8;

const THREAD_HISTORY_LIMIT = 30;

/**
 * When an AI reply may go out. Within 15 minutes of the lead's latest text
 * it sends at any hour; later than that it waits for the normal 9pm-8am
 * quiet hours to end. Follow-ups, reminders, reactivation and review texts
 * don't use this — they keep their own windows.
 */
export function aiReplySendTime(lastInboundAt: Date, now: Date, timeZone: string): Date {
  if (now.getTime() - lastInboundAt.getTime() <= AI_LIVE_WINDOW_MS) return now;
  return nextSendableAt(now, timeZone);
}

export async function pauseAiForContact(supabase: Admin, contactId: string, reason: string) {
  await supabase
    .from("contacts")
    .update({ ai_paused_at: new Date().toISOString(), ai_paused_reason: reason })
    .eq("id", contactId);
}

export async function resumeAiForContact(supabase: Admin, contactId: string) {
  await supabase
    .from("contacts")
    .update({ ai_paused_at: null, ai_paused_reason: null })
    .eq("id", contactId);
}

export async function isAiPausedForContact(supabase: Admin, contactId: string): Promise<boolean> {
  const { data } = await supabase
    .from("contacts")
    .select("ai_paused_at")
    .eq("id", contactId)
    .maybeSingle();
  return Boolean(data?.ai_paused_at);
}

export type AiTextContext = {
  client: ClientRow;
  contact: { id: string; name: string; phone: string };
  lead: { id: string; name: string };
  leadMessage: string | null;
  thread: ThreadMessage[];
  lastInboundAt: string;
  lastInboundBody: string;
  aiReplyCount: number;
};

/**
 * Loads everything a reply needs and checks every gate fresh. Called after
 * each wait, since any of these can change while the job sleeps.
 */
export async function loadAiTextContext(
  supabase: Admin,
  opts: { clientId: string; contactId: string; messageSid: string },
): Promise<AiTextContext | { skip: string }> {
  const { data: client } = await supabase.from("clients").select("*").eq("id", opts.clientId).maybeSingle();
  if (!client) return { skip: "no_client" };
  if (!client.ai_text_assistant_enabled) return { skip: "disabled" };
  if (!client.twilio_phone_number) return { skip: "no_number" };

  const { data: contact } = await supabase
    .from("contacts")
    .select("id, name, phones, ai_paused_at")
    .eq("id", opts.contactId)
    .eq("client_id", opts.clientId)
    .maybeSingle();
  if (!contact) return { skip: "no_contact" };
  if (contact.ai_paused_at) return { skip: "paused" };

  const phone = normalizePhone(contact.phones?.[0] ?? "");
  if (!phone) return { skip: "no_phone" };

  const lead = await findOpenLeadForPhone(supabase, opts.clientId, phone);
  if (!lead) return { skip: "no_open_lead" };

  if (await isOptedOut(supabase, opts.clientId, phone, contact.id)) return { skip: "opted_out" };
  const a2p = checkA2pGate(client, phone);
  if (!a2p.allowed) return { skip: a2p.reason };

  const { data: rows } = await supabase
    .from("messages")
    .select("direction, body, external_id, ai_generated, created_at")
    .eq("client_id", opts.clientId)
    .eq("contact_id", opts.contactId)
    .eq("channel", "sms")
    .order("created_at", { ascending: false })
    .limit(THREAD_HISTORY_LIMIT);
  const messages = [...(rows ?? [])].reverse();

  const lastInboundIndex = messages.map((m) => m.direction).lastIndexOf("inbound");
  if (lastInboundIndex === -1) return { skip: "no_inbound" };
  const lastInbound = messages[lastInboundIndex]!;
  // A newer text arrived: the job that text started will answer both.
  if (lastInbound.external_id !== opts.messageSid) return { skip: "newer_message" };
  // Someone (the owner, or an earlier run) already answered it.
  if (lastInboundIndex !== messages.length - 1) return { skip: "already_answered" };

  // AI replies since the owner last texted in this thread themselves, or
  // last handed it back to the AI — whichever is more recent.
  const { data: handedBack } = await supabase
    .from("activities")
    .select("occurred_at")
    .eq("contact_id", opts.contactId)
    .eq("type", AI_HANDED_BACK_ACTIVITY)
    .order("occurred_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const countFrom = handedBack ? new Date(handedBack.occurred_at).getTime() : 0;

  let aiReplyCount = 0;
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const m = messages[i]!;
    if (m.direction !== "outbound") continue;
    if (!m.ai_generated || new Date(m.created_at).getTime() <= countFrom) break;
    aiReplyCount += 1;
  }

  const { data: leadRow } = await supabase.from("leads").select("message").eq("id", lead.id).maybeSingle();

  return {
    client,
    contact: { id: contact.id, name: contact.name, phone },
    lead: { id: lead.id, name: lead.name },
    leadMessage: leadRow?.message ?? null,
    thread: messages
      .filter((m) => m.direction === "inbound" || m.direction === "outbound")
      .map((m) => ({ direction: m.direction as "inbound" | "outbound", body: m.body ?? "" })),
    lastInboundAt: lastInbound.created_at,
    lastInboundBody: lastInbound.body ?? "",
    aiReplyCount,
  };
}

const NO_USAGE = { model: "none", inputTokens: 0, outputTokens: 0 };

/** Decides what to do with the lead's latest text: reply, book, or hand off. */
export async function generateAiTextReply(supabase: Admin, ctx: AiTextContext): Promise<AssistantOutcome> {
  if (ctx.aiReplyCount >= AI_REPLY_CAP) {
    return {
      kind: "handoff",
      reason: "reply_cap",
      summary: `The AI has sent ${ctx.aiReplyCount} replies without a booking.`,
      usage: NO_USAGE,
    };
  }

  const keyword = detectHandoffKeyword(ctx.lastInboundBody);
  if (keyword) {
    return {
      kind: "handoff",
      reason: keyword,
      summary: keyword === "emergency" ? "The customer may be describing an emergency." : "The customer asked for a person.",
      usage: NO_USAGE,
    };
  }

  const timeZone = ctx.client.timezone ?? "America/Chicago";
  const knowledgeInput = {
    client: ctx.client,
    ...(await loadBusinessKnowledgeParts(supabase, ctx.client.id)),
  };
  const now = new Date().toLocaleString("en-US", {
    timeZone,
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  const contextNote = [
    `Current date and time for the business: ${now} (${timeZone}).`,
    `Customer name on file: ${ctx.lead.name}.`,
    ctx.leadMessage ? `What they first asked for: ${ctx.leadMessage}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  return runTextAssistant({
    systemPrompt: buildTextAssistantPrompt(knowledgeInput),
    contextNote,
    thread: ctx.thread,
    allowedTimeText: [
      buildBusinessKnowledgeSummary(knowledgeInput),
      ...ctx.thread.map((m) => m.body),
    ].join("\n"),
    tools: {
      checkAvailability: ({ serviceName, earliest }) =>
        checkAvailabilityForService(supabase, {
          clientId: ctx.client.id,
          serviceName,
          earliest,
          timeZone,
        }),
      bookAppointment: ({ serviceName, startAt, customerName }) =>
        bookAppointmentForCustomer(supabase, ctx.client, {
          serviceName,
          startAt: new Date(startAt),
          customerName: customerName || ctx.lead.name,
          customerPhone: ctx.contact.phone,
          source: "ai_text_assistant",
        }),
    },
  });
}

/** Sends one AI-written text through the normal opt-out and A2P checks,
 * marks it as AI in the inbox, and counts it against the allowance. */
export async function sendAiText(
  supabase: Admin,
  opts: { client: ClientRow; contactId: string; to: string; body: string },
): Promise<boolean> {
  const from = resolveSmsFrom(opts.client);
  if (!from) return false;
  const result = await sendFunnelMessage(supabase, {
    clientId: opts.client.id,
    trigger: "ai_text_reply",
    to: opts.to,
    from,
    body: opts.body,
    contactId: opts.contactId,
    aiGenerated: true,
  });
  if (result.status !== "sent") return false;

  const { data: current } = await supabase
    .from("clients")
    .select("ai_text_replies_used_this_month")
    .eq("id", opts.client.id)
    .maybeSingle();
  await supabase
    .from("clients")
    .update({ ai_text_replies_used_this_month: (current?.ai_text_replies_used_this_month ?? 0) + 1 })
    .eq("id", opts.client.id);
  return true;
}

const HANDOFF_LABELS: Record<HandoffReason, string> = {
  unknown_answer: "has a question the AI couldn't answer",
  upset: "seems upset",
  wants_person: "asked for a person",
  emergency: "may have an emergency",
  reply_cap: "is still talking with the AI and hasn't booked",
  guard_blocked: "needs a reply the AI couldn't write",
  error: "needs a reply the AI couldn't write",
};

const HOLDING_TEXT = "Thanks — I'm passing this to the team and someone will get back to you shortly.";
const EMERGENCY_HOLDING_TEXT =
  "Thanks for letting us know. I'm alerting the team right now and someone will contact you as soon as possible. If anyone is in danger, call 911.";

/**
 * Stops the AI on this thread, tells the customer the team will follow up,
 * and alerts the owner. The owner alert goes out at any hour, like the
 * other owner alerts.
 */
export async function handOffToOwner(
  supabase: Admin,
  opts: {
    client: ClientRow;
    contact: { id: string; name: string; phone: string };
    reason: HandoffReason;
    lastInboundBody: string;
  },
) {
  await pauseAiForContact(supabase, opts.contact.id, opts.reason);

  await sendAiText(supabase, {
    client: opts.client,
    contactId: opts.contact.id,
    to: opts.contact.phone,
    body: opts.reason === "emergency" ? EMERGENCY_HOLDING_TEXT : HOLDING_TEXT,
  });

  const prefix = opts.reason === "emergency" ? "URGENT — " : "";
  const alert = `${prefix}${opts.contact.name} ${HANDOFF_LABELS[opts.reason]}: "${opts.lastInboundBody.slice(0, 100)}" — the AI has stopped; reply in your portal inbox.`;

  if (opts.client.phone) {
    await getSmsProvider()
      .send({
        to: normalizePhone(opts.client.phone),
        from: resolveOwnerAlertFrom(opts.client),
        body: alert,
      })
      .catch(() => undefined);
  }
  await sendPushToClient(opts.client.id, {
    title: `${prefix}Needs you — ${opts.contact.name}`,
    body: alert.slice(0, 160),
    url: `/inbox?contact=${opts.contact.id}`,
  }).catch(() => undefined);
}
