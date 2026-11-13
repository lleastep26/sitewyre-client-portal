import { createAdminClient } from "@/lib/supabase/admin";
import { verifyRetellSignature } from "@/lib/integrations/retell";
import { recordAiCallOutcome } from "@/lib/retell/call-summary";
import { inngest } from "@/lib/inngest/client";

type RetellWebhookPayload = {
  event: string;
  call: {
    call_id: string;
    start_timestamp?: number;
    end_timestamp?: number;
    recording_url?: string;
    call_analysis?: { call_summary?: string };
    metadata?: Record<string, unknown>;
  };
};

function metadataString(payload: RetellWebhookPayload, key: string): string | null {
  const value = payload.call.metadata?.[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

/**
 * Retell's agent-level webhook (set as webhook_url when the agent is
 * created).
 *
 * call_started — the caller actually reached the AI. Recorded on the
 * `calls` row right away, because missedCallTextBack checks it 30s after
 * the handoff and most AI calls are still in progress at that point.
 *
 * call_ended — tallies minutes used against the monthly allowance, and
 * queues a fallback so the owner still gets their after-call text if the
 * analysis below never arrives.
 *
 * call_analyzed — Retell's post-call summary is ready: saves it and the
 * recording link on the lead and sends the owner their one text.
 */
export async function POST(request: Request) {
  const raw = await request.text();
  const signature = request.headers.get("x-retell-signature");
  if (!(await verifyRetellSignature(raw, signature))) {
    return new Response("Invalid signature", { status: 401 });
  }

  const payload = JSON.parse(raw) as RetellWebhookPayload;
  const supabase = createAdminClient();

  if (payload.event === "call_started") {
    const twilioCallSid = metadataString(payload, "twilio_call_sid");
    if (twilioCallSid) {
      await supabase.from("calls").update({ ai_handled: true }).eq("twilio_call_sid", twilioCallSid);
    }
    return new Response("ok");
  }

  const clientId = metadataString(payload, "client_id");
  if (!clientId) return new Response("ok");

  const outcome = {
    clientId,
    callId: payload.call.call_id,
    callerNumber: metadataString(payload, "caller_number"),
    twilioCallSid: metadataString(payload, "twilio_call_sid"),
    recordingUrl: payload.call.recording_url ?? null,
    startTimestamp: payload.call.start_timestamp ?? null,
  };

  if (payload.event === "call_analyzed") {
    await recordAiCallOutcome(supabase, {
      ...outcome,
      summary: payload.call.call_analysis?.call_summary ?? null,
    });
    return new Response("ok");
  }

  if (payload.event !== "call_ended") return new Response("ok");

  await inngest.send({ name: "portal/ai-call.ended", data: outcome }).catch(() => undefined);

  const { start_timestamp, end_timestamp } = payload.call;
  if (!start_timestamp || !end_timestamp || end_timestamp <= start_timestamp) {
    return new Response("ok");
  }
  const minutes = (end_timestamp - start_timestamp) / 60_000;

  const { data: client } = await supabase
    .from("clients")
    .select("retell_minutes_used_this_month")
    .eq("id", clientId)
    .maybeSingle();
  if (!client) return new Response("ok");

  await supabase
    .from("clients")
    .update({
      retell_minutes_used_this_month: Number(client.retell_minutes_used_this_month ?? 0) + minutes,
    })
    .eq("id", clientId);

  return new Response("ok");
}
