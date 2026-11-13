import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

/**
 * "Press 1 to accept" screening on the owner's leg of a forwarded call.
 *
 * A carrier voicemail that picks up inside the dial timeout looks to
 * Twilio exactly like the owner answering, so the caller ends up in the
 * owner's voicemail and the missed-call path (AI receptionist, text-back)
 * never runs. With screening, whoever answers the owner's phone hears a
 * short prompt and has to press 1 before the caller is connected. A
 * voicemail can't, so its leg is dropped and the call is treated as
 * unanswered. The caller hears ringing the whole time.
 *
 * Twilio's DialCallStatus is not a reliable signal for "the owner
 * declined the prompt", so an accepted call is recorded here and the
 * Dial's action callback checks that record instead.
 */

export function xmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function screenQuery(clientId: string, parentCallSid: string): string {
  return `?client=${encodeURIComponent(clientId)}&parent=${encodeURIComponent(parentCallSid)}`;
}

/** The URL Twilio fetches when the owner's phone (or its voicemail) answers. */
export function ownerWhisperUrl(appUrl: string, clientId: string, parentCallSid: string): string {
  return `${appUrl}/api/twilio/whisper${screenQuery(clientId, parentCallSid)}`;
}

/** Where the pressed digit is sent. */
export function ownerAcceptUrl(appUrl: string, clientId: string, parentCallSid: string): string {
  return `${appUrl}/api/twilio/whisper/accept${screenQuery(clientId, parentCallSid)}`;
}

/** The Dial that rings the owner with screening on. */
export function screenedDialTwiml(opts: {
  forwardTo: string;
  timeoutSeconds: number;
  actionUrl: string;
  whisperUrl: string;
}): string {
  // answerOnBridge keeps the caller hearing ringing (not silence) while the
  // prompt plays on the owner's side.
  return (
    `<Response><Dial timeout="${opts.timeoutSeconds}" action="${xmlEscape(opts.actionUrl)}" answerOnBridge="true">` +
    `<Number url="${xmlEscape(opts.whisperUrl)}">${xmlEscape(opts.forwardTo)}</Number>` +
    `</Dial></Response>`
  );
}

/**
 * Screening is only used where there is something to hand the caller to:
 * a client with the AI receptionist on. Everyone else is forwarded plainly
 * and an unanswered call reaches the owner's own voicemail.
 */
export function usesCallScreening(client: {
  ai_receptionist_enabled?: boolean | null;
  retell_agent_id?: string | null;
}): boolean {
  return Boolean(client.ai_receptionist_enabled && client.retell_agent_id);
}

/** What the owner's side hears on answering. No digit within a few seconds hangs up that leg. */
export function whisperTwiml(
  businessName: string | null | undefined,
  acceptUrl: string,
  callLabel: "Call" | "Emergency call" = "Call",
): string {
  const name = businessName?.trim() || "your business";
  const prompt = xmlEscape(`${callLabel} for ${name}, press 1 to accept.`);
  return (
    `<Response>` +
    `<Gather numDigits="1" timeout="3" action="${xmlEscape(acceptUrl)}">` +
    `<Say>${prompt}</Say><Pause length="1"/><Say>${prompt}</Say>` +
    `</Gather>` +
    `<Hangup/>` +
    `</Response>`
  );
}

export const ACCEPTED_TWIML = "<Response><Say>Connecting.</Say></Response>";
export const DECLINED_TWIML = "<Response><Hangup/></Response>";

type Admin = SupabaseClient<Database>;

/** Records that the owner pressed 1 for this inbound call. */
export async function recordOwnerAccepted(
  supabase: Admin,
  clientId: string,
  parentCallSid: string,
): Promise<void> {
  const { error } = await supabase.from("calls").insert({
    client_id: clientId,
    direction: "inbound",
    missed: false,
    twilio_call_sid: parentCallSid,
  });
  if (error) console.error("Could not record accepted call", error);
}

/** Whether the owner pressed 1 for this inbound call. */
export async function ownerAcceptedCall(
  supabase: Admin,
  clientId: string,
  parentCallSid: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("calls")
    .select("id")
    .eq("client_id", clientId)
    .eq("twilio_call_sid", parentCallSid)
    .eq("missed", false)
    .limit(1);
  return Boolean(data?.length);
}
