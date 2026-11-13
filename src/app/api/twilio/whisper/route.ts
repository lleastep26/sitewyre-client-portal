import { createAdminClient } from "@/lib/supabase/admin";
import { validateTwilioSignature } from "@/lib/twilio/validate";
import { getAppUrl } from "@/lib/supabase/env";
import { DECLINED_TWIML, ownerAcceptUrl, whisperTwiml } from "@/lib/twilio/call-screen";

function xml(body: string) {
  return new Response(body, { headers: { "Content-Type": "text/xml" } });
}

/**
 * Runs on the owner's leg of a forwarded call the moment that phone (or
 * its voicemail) answers, before the caller is connected: plays "Call for
 * [business], press 1 to accept." The digit goes to ./accept. With no
 * digit the leg is hung up and the Dial's action callback
 * (/api/twilio/webhook) treats the call as unanswered.
 */
export async function POST(request: Request) {
  const url = new URL(request.url);
  const form = await request.formData();
  const params = new URLSearchParams();
  form.forEach((value, key) => params.set(key, String(value)));

  // Twilio signs the full URL, query string included.
  if (!validateTwilioSignature(request, params, `/api/twilio/whisper${url.search}`)) {
    return new Response("Invalid signature", { status: 403 });
  }

  const clientId = url.searchParams.get("client");
  const parentCallSid = url.searchParams.get("parent");
  if (!clientId || !parentCallSid) return xml(DECLINED_TWIML);

  const supabase = createAdminClient();
  const { data: client } = await supabase
    .from("clients")
    .select("business_name")
    .eq("id", clientId)
    .maybeSingle();
  if (!client) return xml(DECLINED_TWIML);

  return xml(
    whisperTwiml(client.business_name, ownerAcceptUrl(getAppUrl(), clientId, parentCallSid)),
  );
}
