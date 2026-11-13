import { createAdminClient } from "@/lib/supabase/admin";
import { validateTwilioSignature } from "@/lib/twilio/validate";

const EMPTY_TWIML = "<Response></Response>";

function xml(body: string) {
  return new Response(body, { headers: { "Content-Type": "text/xml" } });
}

/**
 * Action callback for the Dial<Sip> that hands a live call to Retell
 * (business-hours fallback and after-hours direct, both in
 * /api/twilio/voice and /api/twilio/webhook). DialCallStatus=completed
 * means the caller actually reached and talked to the AI — recorded on
 * the existing `calls` row so missedCallTextBack can skip the normal
 * missed-call text when the AI handled it, and send it when the handoff
 * failed or the caller hung up before connecting.
 */
export async function POST(request: Request) {
  const form = await request.formData();
  const params = new URLSearchParams();
  form.forEach((value, key) => params.set(key, String(value)));

  if (!validateTwilioSignature(request, params, "/api/retell/dial-status")) {
    return new Response("Invalid signature", { status: 403 });
  }

  const callSid = params.get("CallSid");
  const dialCallStatus = params.get("DialCallStatus");

  if (callSid && dialCallStatus === "completed") {
    const supabase = createAdminClient();
    await supabase.from("calls").update({ ai_handled: true }).eq("twilio_call_sid", callSid);
  }

  return xml(EMPTY_TWIML);
}
