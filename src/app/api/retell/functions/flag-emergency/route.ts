import { createAdminClient } from "@/lib/supabase/admin";
import {
  readVerifiedRetellBody,
  clientIdFromCall,
  jsonResult,
  type RetellFunctionCallBody,
} from "@/lib/retell/webhook";
import { getSmsProvider, getVoiceProvider } from "@/lib/adapters";
import { resolveSmsFrom } from "@/lib/a2p/sending";
import { normalizePhone } from "@/lib/utils";
import { getAppUrl } from "@/lib/supabase/env";
import { whisperTwiml } from "@/lib/twilio/call-screen";

export async function POST(request: Request) {
  const raw = await readVerifiedRetellBody(request);
  if (!raw) return new Response("Invalid signature", { status: 401 });
  const body = JSON.parse(raw) as RetellFunctionCallBody;

  const clientId = clientIdFromCall(body.call);
  if (!clientId) return jsonResult({ error: "Unknown client." });

  const supabase = createAdminClient();
  const { data: client } = await supabase
    .from("clients")
    .select("phone, forward_to_phone, twilio_phone_number, business_name, a2p_status, a2p_pipeline")
    .eq("id", clientId)
    .maybeSingle();
  if (!client) return jsonResult({ error: "Unknown client." });

  const summary = typeof body.args.summary === "string" && body.args.summary ? body.args.summary : "no details given";
  const originalCallSid =
    typeof body.call.metadata?.twilio_call_sid === "string" ? body.call.metadata.twilio_call_sid : null;

  // 1. One urgent alert to the owner — this is an owner alert, not a
  // customer text, so it deliberately bypasses quiet hours.
  if (client.phone) {
    await getSmsProvider()
      .send({
        to: normalizePhone(client.phone),
        from: resolveSmsFrom(client) ?? undefined,
        body: `URGENT — possible emergency on an AI-answered call: ${summary}. We're trying to connect you now.`,
      })
      .catch(() => undefined);
  }

  // 2. One extra ring to the owner. Whoever answers hears "Emergency call
  // for [business], press 1 to accept." Only on 1 does the
  // emergency-accept route put the owner in a conference and pull the
  // caller's still-live call into it. If the owner doesn't pick up, or
  // their voicemail does, nobody presses 1, that leg is hung up and the
  // caller is never pulled off the AI — matching "no repeat rings" exactly.
  let transferAttempted = false;
  if (client.forward_to_phone && client.twilio_phone_number && originalCallSid) {
    const conferenceName = `emergency-${body.call.call_id}`;
    const acceptUrl = `${getAppUrl()}/api/retell/emergency-accept?originalCallSid=${encodeURIComponent(originalCallSid)}&conference=${encodeURIComponent(conferenceName)}`;
    try {
      await getVoiceProvider().createOutboundCall({
        to: normalizePhone(client.forward_to_phone),
        from: client.twilio_phone_number,
        twiml: whisperTwiml(client.business_name, acceptUrl, "Emergency call"),
      });
      transferAttempted = true;
    } catch {
      transferAttempted = false;
    }
  }

  return jsonResult({
    ok: true,
    transfer_attempted: transferAttempted,
    instructions:
      "Tell the caller to call 911 immediately if there is any danger to life. Let them know you're trying to reach the owner now. If the owner doesn't pick up, reassure the caller, do not mention trying again, and offer them the earliest available appointment slot via check_availability instead.",
  });
}
