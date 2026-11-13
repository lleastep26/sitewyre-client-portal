import { createAdminClient } from "@/lib/supabase/admin";
import { normalizePhone } from "@/lib/utils";
import { validateTwilioSignature } from "@/lib/twilio/validate";
import { getAppUrl } from "@/lib/supabase/env";
import { isWithinBusinessHours } from "@/lib/scheduling/slots";
import { registerRetellPhoneCall, retellSipUri } from "@/lib/integrations/retell";
import { inngest } from "@/lib/inngest/client";
import { ownerWhisperUrl, screenedDialTwiml, usesCallScreening } from "@/lib/twilio/call-screen";
import { classifyInboundCall, REJECT_TWIML } from "@/lib/twilio/forwarded-calls";
import { getVoiceProvider } from "@/lib/adapters";

const EMPTY_TWIML = "<Response></Response>";

function xml(body: string) {
  return new Response(body, { headers: { "Content-Type": "text/xml" } });
}

/** Records the call as missed and queues the missed-call text-back, which
 * skips itself if the AI receptionist ends up handling the call. */
async function recordMissedCall(opts: {
  supabase: ReturnType<typeof createAdminClient>;
  clientId: string;
  callSid: string;
  /** The caller's number, or "" when it isn't known (nobody to text). */
  callerNumber: string;
  forwardedFrom?: string;
}) {
  await opts.supabase.from("calls").insert({
    client_id: opts.clientId,
    direction: "inbound",
    missed: true,
    twilio_call_sid: opts.callSid,
    ...(opts.forwardedFrom ? { forwarded_from: opts.forwardedFrom } : {}),
  });
  if (opts.callerNumber) {
    await inngest.send({
      name: "portal/call.missed",
      data: { clientId: opts.clientId, from: opts.callerNumber, callSid: opts.callSid },
    });
  }
}

async function handOffToRetell(opts: {
  supabase: ReturnType<typeof createAdminClient>;
  clientId: string;
  agentId: string;
  callSid: string;
  from: string;
  to: string;
  /** Set for a forwarded call. */
  forwarded?: { forwardedFrom: string; callerKnown: boolean };
}) {
  const callerNumber = opts.forwarded && !opts.forwarded.callerKnown ? "" : opts.from;
  await recordMissedCall({
    supabase: opts.supabase,
    clientId: opts.clientId,
    callSid: opts.callSid,
    callerNumber,
    forwardedFrom: opts.forwarded?.forwardedFrom,
  });

  const { callId } = await registerRetellPhoneCall({
    agentId: opts.agentId,
    fromNumber: opts.from,
    toNumber: opts.to,
    metadata: { client_id: opts.clientId, caller_number: callerNumber, twilio_call_sid: opts.callSid },
    ...(opts.forwarded ? { callerNumber } : {}),
  });
  const actionUrl = `${getAppUrl()}/api/retell/dial-status`;
  return xml(
    `<Response><Dial action="${actionUrl}"><Sip>${retellSipUri(callId)}</Sip></Dial></Response>`,
  );
}

/** Whether this caller already has another live call on this number. Never
 * holds the call up: a slow or failed lookup counts as "no". */
async function callerHasOtherLiveCall(from: string, to: string, callSid: string): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const giveUp = new Promise<boolean>((resolve) => {
    timer = setTimeout(() => resolve(false), 2500);
  });
  const lookup = getVoiceProvider()
    .hasOtherLiveCall({ from, to, excludeCallSid: callSid })
    .catch(() => false);
  try {
    return await Promise.race([lookup, giveUp]);
  } finally {
    clearTimeout(timer);
  }
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
 *
 * A forwarded call (the client's own number forwards unanswered calls
 * here, see forwarded-calls.ts) has already rung the owner once, so it
 * skips all of that and goes straight to the AI receptionist at any hour.
 * Our own rings to the owner that come back through their call forwarding
 * are rejected, so a call can never loop.
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
    .select(
      "id, phone, forward_to_phone, business_line_phone, call_forwarding_enabled, dial_timeout_seconds, ai_receptionist_enabled, retell_agent_id, timezone",
    )
    .eq("twilio_phone_number", to)
    .maybeSingle();

  if (!client) return xml(EMPTY_TWIML);

  const inbound = classifyInboundCall(client, {
    from,
    to,
    forwardedFrom: params.get("ForwardedFrom") ?? "",
  });
  if (inbound.kind === "own_leg") return xml(REJECT_TWIML);

  if (inbound.kind === "forwarded") {
    // Spotted only by ForwardedFrom: it could be our own ring to the owner
    // coming back. If this caller is already on a call here, that's what
    // it is, and the original call carries on to the AI by itself.
    if (inbound.mayBeBounce && callSid && from && (await callerHasOtherLiveCall(from, to, callSid))) {
      return xml(REJECT_TWIML);
    }
    if (client.ai_receptionist_enabled && client.retell_agent_id && callSid) {
      try {
        return await handOffToRetell({
          supabase,
          clientId: client.id,
          agentId: client.retell_agent_id,
          callSid,
          from,
          to,
          forwarded: inbound,
        });
      } catch {
        // The call is already recorded as missed, so the missed-call
        // text-back takes over.
        return xml(EMPTY_TWIML);
      }
    }
    // No AI receptionist to take it, and ringing the owner again would
    // only forward straight back here: treat it as a missed call.
    if (callSid) {
      await recordMissedCall({
        supabase,
        clientId: client.id,
        callSid,
        callerNumber: inbound.callerKnown ? from : "",
        forwardedFrom: inbound.forwardedFrom,
      });
    }
    return xml(EMPTY_TWIML);
  }

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

  // About to ring the owner. If this caller is already on a call here, this
  // is that call's ring coming back through the owner's call forwarding
  // (set up on their phone without telling us): ringing them again would loop.
  if (callSid && from && (await callerHasOtherLiveCall(from, to, callSid))) {
    return xml(REJECT_TWIML);
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
