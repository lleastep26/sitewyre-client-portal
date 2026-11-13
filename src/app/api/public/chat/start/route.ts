import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { json, options } from "@/lib/http/cors";
import { ingestLead } from "@/lib/leads/ingest";
import { verifyTurnstileToken } from "@/lib/security/turnstile";
import { answerChatMessage } from "@/lib/chat-widget/conversation";
import {
  CHAT_MAX_MESSAGE_LENGTH,
  CHAT_MAX_SESSIONS_PER_IP_PER_HOUR,
  clientIp,
  hashIp,
  hashToken,
  isAllowedChatOrigin,
  newSessionToken,
} from "@/lib/chat-widget/limits";

// The model call can outlast the default function limit.
export const maxDuration = 60;

export function OPTIONS() {
  return options();
}

const startSchema = z.object({
  site_key: z.string().min(1),
  name: z.string().trim().min(1).max(100),
  phone: z.string().trim().min(7).max(30),
  message: z.string().trim().min(1).max(CHAT_MAX_MESSAGE_LENGTH),
  turnstile_token: z.string().optional(),
  /** Honeypot: a hidden field real visitors never fill in. */
  website: z.string().optional(),
});

/**
 * First step of a website chat: the visitor's name, phone and what they
 * need. Creates the lead straight away (so the instant text and follow-ups
 * start), opens a chat session, and answers their first message.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid request" }, 400);
  }
  const parsed = startSchema.safeParse(body);
  if (!parsed.success) return json({ error: "Please enter your name, phone number and what you need." }, 400);
  const input = parsed.data;
  if (input.website) return json({ error: "Invalid request" }, 400);

  const supabase = createAdminClient();
  const { data: client } = await supabase
    .from("clients")
    .select("*")
    .eq("site_key", input.site_key)
    .maybeSingle();
  if (!client?.chat_widget_enabled) return json({ error: "Chat isn't available." }, 403);
  if (!isAllowedChatOrigin(request.headers.get("origin"), client)) {
    return json({ error: "Chat isn't available on this site." }, 403);
  }

  const ip = clientIp(request);
  const ipHash = ip ? hashIp(ip) : null;
  if (ipHash) {
    const { count } = await supabase
      .from("chat_sessions")
      .select("*", { count: "exact", head: true })
      .eq("ip_hash", ipHash)
      .gte("created_at", new Date(Date.now() - 3_600_000).toISOString());
    if ((count ?? 0) >= CHAT_MAX_SESSIONS_PER_IP_PER_HOUR) {
      return json({ error: "Too many chats started. Please try again later." }, 429);
    }
  }

  const turnstile = await verifyTurnstileToken(input.turnstile_token, ip);
  if (!turnstile.ok) return json({ error: "Verification failed. Please try again." }, 403);

  const lead = await ingestLead(supabase, client, {
    name: input.name,
    phone: input.phone,
    message: input.message,
    source: "chat_widget",
    smsOptIn: true,
  });
  if ("error" in lead) return json({ error: "Something went wrong. Please try again." }, 500);

  const token = newSessionToken();
  const { data: session, error } = await supabase
    .from("chat_sessions")
    .insert({
      client_id: client.id,
      contact_id: lead.contactId,
      lead_id: lead.leadId,
      token_hash: hashToken(token),
      ip_hash: ipHash,
    })
    .select("id, contact_id, lead_id, created_at, owner_alerted_at, visitor_message_count")
    .single();
  if (error || !session) return json({ error: "Something went wrong. Please try again." }, 500);

  const { reply } = await answerChatMessage(supabase, {
    client,
    session,
    visitorName: input.name,
    visitorMessage: input.message,
  });

  return json({ session_token: token, reply });
}
