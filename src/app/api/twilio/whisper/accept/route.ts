import { createAdminClient } from "@/lib/supabase/admin";
import { validateTwilioSignature } from "@/lib/twilio/validate";
import { ACCEPTED_TWIML, DECLINED_TWIML, recordOwnerAccepted } from "@/lib/twilio/call-screen";

function xml(body: string) {
  return new Response(body, { headers: { "Content-Type": "text/xml" } });
}

/**
 * Receives the digit pressed at the "press 1 to accept" prompt. 1 records
 * the call as accepted and lets Twilio connect the caller; anything else
 * hangs up the owner's leg.
 */
export async function POST(request: Request) {
  const url = new URL(request.url);
  const form = await request.formData();
  const params = new URLSearchParams();
  form.forEach((value, key) => params.set(key, String(value)));

  if (!validateTwilioSignature(request, params, `/api/twilio/whisper/accept${url.search}`)) {
    return new Response("Invalid signature", { status: 403 });
  }

  const clientId = url.searchParams.get("client");
  const parentCallSid = url.searchParams.get("parent");
  if (params.get("Digits") !== "1" || !clientId || !parentCallSid) {
    return xml(DECLINED_TWIML);
  }

  await recordOwnerAccepted(createAdminClient(), clientId, parentCallSid);
  return xml(ACCEPTED_TWIML);
}
