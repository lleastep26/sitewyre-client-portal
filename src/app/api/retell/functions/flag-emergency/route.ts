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

  // 2. One extra ring to the owner. If they answer, the TwiML joins a
  // conference; the emergency-transfer-status webhook only redirects the
  // caller's still-live call into that same conference once this leg is
  // actually answered — if it's never answered, the caller is never
  // pulled off the AI, matching "no repeat rings" exactly.
  let transferAttempted = false;
  if (client.forward_to_phone && client.twilio_phone_number && originalCallSid) {
    const conferenceName = `emergency-${body.call.call_id}`;
    const ownerTwiml = `<Response><Dial><Conference endConferenceOnExit="true">${conferenceName}</Conference></Dial></Response>`;
    const statusCallback = `${getAppUrl()}/api/retell/emergency-transfer-status?originalCallSid=${encodeURIComponent(originalCallSid)}&conference=${encodeURIComponent(conferenceName)}`;
    try {
      await getVoiceProvider().createOutboundCall({
        to: normalizePhone(client.forward_to_phone),
        from: client.twilio_phone_number,
        twiml: ownerTwiml,
        statusCallback,
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
