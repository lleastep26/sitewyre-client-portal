import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { json, options } from "@/lib/http/cors";
import { answerChatMessage } from "@/lib/chat-widget/conversation";
import {
  CHAT_MAX_MESSAGE_LENGTH,
  CHAT_MAX_VISITOR_MESSAGES,
  CHAT_MIN_MESSAGE_GAP_MS,
  hashToken,
  isAllowedChatOrigin,
} from "@/lib/chat-widget/limits";

// The model call can outlast the default function limit.
export const maxDuration = 60;

export function OPTIONS() {
  return options();
}

const messageSchema = z.object({
  session_token: z.string().min(32).max(128),
  message: z.string().trim().min(1).max(CHAT_MAX_MESSAGE_LENGTH),
});

/** A follow-on message in an open website chat. */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid request" }, 400);
  }
  const parsed = messageSchema.safeParse(body);
  if (!parsed.success) return json({ error: "Invalid message" }, 400);

  const supabase = createAdminClient();
  const { data: session } = await supabase
    .from("chat_sessions")
    .select("id, client_id, contact_id, lead_id, created_at, owner_alerted_at, visitor_message_count, last_message_at")
    .eq("token_hash", hashToken(parsed.data.session_token))
    .maybeSingle();
  if (!session) return json({ error: "This chat has ended. Please start a new one." }, 404);

  const { data: client } = await supabase
    .from("clients")
    .select("*")
    .eq("id", session.client_id)
    .maybeSingle();
  if (!client?.chat_widget_enabled) return json({ error: "Chat isn't available." }, 403);
  if (!isAllowedChatOrigin(request.headers.get("origin"), client)) {
    return json({ error: "Chat isn't available on this site." }, 403);
  }

  if (session.visitor_message_count >= CHAT_MAX_VISITOR_MESSAGES) {
    return json({ error: "This chat has reached its limit. The team will follow up with you." }, 429);
  }
  if (
    session.last_message_at &&
    Date.now() - new Date(session.last_message_at).getTime() < CHAT_MIN_MESSAGE_GAP_MS
  ) {
    return json({ error: "You're sending messages too quickly." }, 429);
  }

  const { data: contact } = await supabase
    .from("contacts")
    .select("name")
    .eq("id", session.contact_id)
    .maybeSingle();

  const { reply } = await answerChatMessage(supabase, {
    client,
    session,
    visitorName: contact?.name ?? "A visitor",
    visitorMessage: parsed.data.message,
  });
  return json({ reply });
}
