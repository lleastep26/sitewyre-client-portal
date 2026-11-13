import { validateTwilioSignature } from "@/lib/twilio/validate";
import { getVoiceProvider } from "@/lib/adapters";

const EMPTY_TWIML = "<Response></Response>";

function xml(body: string) {
  return new Response(body, { headers: { "Content-Type": "text/xml" } });
}

/**
 * Status callback for the owner's extra-ring emergency call
 * (flag-emergency route). Only on "in-progress" (owner actually answered)
 * do we pull the caller's still-live call into the conference — if the
 * owner never picks up, this never fires and the caller stays on the AI.
 */
export async function POST(request: Request) {
  const url = new URL(request.url);
  const form = await request.formData();
  const params = new URLSearchParams();
  form.forEach((value, key) => params.set(key, String(value)));

  // Twilio signs the full callback URL, query string included.
  if (!validateTwilioSignature(request, params, `/api/retell/emergency-transfer-status${url.search}`)) {
    return new Response("Invalid signature", { status: 403 });
  }

  const callStatus = params.get("CallStatus");
  const originalCallSid = url.searchParams.get("originalCallSid");
  const conference = url.searchParams.get("conference");

  if (callStatus === "in-progress" && originalCallSid && conference) {
    const callerTwiml = `<Response><Dial><Conference endConferenceOnExit="true">${conference}</Conference></Dial></Response>`;
    await getVoiceProvider().redirectCall(originalCallSid, callerTwiml).catch(() => undefined);
  }

  return xml(EMPTY_TWIML);
}
