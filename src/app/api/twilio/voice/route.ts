import { createAdminClient } from "@/lib/supabase/admin";
import { normalizePhone } from "@/lib/utils";
import { validateTwilioSignature } from "@/lib/twilio/validate";
import { getAppUrl } from "@/lib/supabase/env";
import { isWithinBusinessHours } from "@/lib/scheduling/slots";
import { registerRetellPhoneCall, retellSipUri } from "@/lib/integrations/retell";
import { inngest } from "@/lib/inngest/client";
import { ownerWhisperUrl, screenedDialTwiml, usesCallScreening } from "@/lib/twilio/call-screen";

const EMPTY_TWIML = "<Response></Response>";

function xml(body: string) {
  return new Response(body, { headers: { "Content-Type": "text/xml" } });
}

async function handOffToRetell(opts: {
  supabase: ReturnType<typeof createAdminClient>;
  clientId: string;
  agentId: string;
  callSid: string;
  from: string;
  to: string;
}) {
  await opts.supabase.from("calls").insert({
    client_id: opts.clientId,
    direction: "inbound",
    missed: true,
    twilio_call_sid: opts.callSid,
  });
  await inngest.send({
    name: "portal/call.missed",
    data: { clientId: opts.clientId, from: opts.from, callSid: opts.callSid },
  });

  const { callId } = await registerRetellPhoneCall({
    agentId: opts.agentId,
    fromNumber: opts.from,
    toNumber: opts.to,
    metadata: { client_id: opts.clientId, caller_number: opts.from, twilio_call_sid: opts.callSid },
  });
  const actionUrl = `${getAppUrl()}/api/retell/dial-status`;
  return xml(
    `<Response><Dial action="${actionUrl}"><Sip>${retellSipUri(callId)}</Sip></Dial></Response>`,
  );
}

/**
 * The Voice URL set on every purchased number. In business hours, dials
 * forward_to_phone with a timeout; the `action` callback posts
 * DialCallStatus back to /api/twilio/webhook, which detects no-answer/busy
 * there (and hands off to the AI receptionist if it's on). A client with
 * the AI receptionist on also gets a "press 1 to accept" prompt on the
 * owner's side, so a voicemail pickup counts as unanswered too.
 * Outside business hours, a client with the AI receptionist on skips
 * ringing the owner and hands straight to Retell instead. A client who
 * hasn't turned it on keeps the exact pre-Block-6 behavior either way.
 */
export async function POST(request: Request) {
  const form = await request.formData();
  const params = new URLSearchParams();
  form.forEach((value, key) => params.set(key, String(value)));

  if (!validateTwilioSignature(request, params, "/api/twilio/voice")) {
    return new Response("Invalid signature", { status: 403 });
  }

  const to = normalizePhone(params.get("To") ?? "");
  const from = normalizePhone(params.get("From") ?? "");
  const callSid = params.get("CallSid");
  const supabase = createAdminClient();
  const { data: client } = await supabase
    .from("clients")
    .select("id, forward_to_phone, dial_timeout_seconds, ai_receptionist_enabled, retell_agent_id, timezone")
    .eq("twilio_phone_number", to)
    .maybeSingle();

  if (!client) return xml(EMPTY_TWIML);

  if (client.ai_receptionist_enabled && client.retell_agent_id && callSid) {
    const { data: availability } = await supabase
      .from("availability")
      .select("weekday, start_time, end_time, buffer_minutes, min_notice_hours")
      .eq("client_id", client.id);
    const timeZone = client.timezone ?? "America/Chicago";
    const afterHours = !isWithinBusinessHours(new Date(), availability ?? [], timeZone);

    if (afterHours) {
      try {
        return await handOffToRetell({
          supabase,
          clientId: client.id,
          agentId: client.retell_agent_id,
          callSid,
          from,
          to,
        });
      } catch {
        return xml(EMPTY_TWIML);
      }
    }
  }

  if (!client.forward_to_phone) {
    return xml(EMPTY_TWIML);
  }

  const forward = normalizePhone(client.forward_to_phone);
  const timeout = client.dial_timeout_seconds ?? 15;
  const actionUrl = `${getAppUrl()}/api/twilio/webhook`;
  // Without the AI receptionist the call is forwarded as it always was, so
  // an unanswered call still reaches the owner's own voicemail.
  if (!callSid || !usesCallScreening(client)) {
    return xml(
      `<Response><Dial timeout="${timeout}" action="${actionUrl}"><Number>${forward}</Number></Dial></Response>`,
    );
  }

  // With the AI receptionist on, whoever answers the owner's phone must
  // press 1 before the caller is connected, so a voicemail pickup counts
  // as unanswered and the AI takes the call (see call-screen.ts).
  return xml(
    screenedDialTwiml({
      forwardTo: forward,
      timeoutSeconds: timeout,
      actionUrl,
      whisperUrl: ownerWhisperUrl(getAppUrl(), client.id, callSid),
    }),
  );
}
