import { validateTwilioSignature } from "@/lib/twilio/validate";
import { getVoiceProvider } from "@/lib/adapters";
import { DECLINED_TWIML, xmlEscape } from "@/lib/twilio/call-screen";

function xml(body: string) {
  return new Response(body, { headers: { "Content-Type": "text/xml" } });
}

/**
 * Receives the digit pressed at the "Emergency call for [business], press
 * 1 to accept" prompt on the owner's extra-ring emergency call
 * (flag-emergency route). Only on 1 is the caller's still-live call pulled
 * into the conference with the owner. A voicemail can't press 1, so it
 * never takes the caller away from the AI; with no digit Twilio hangs up
 * the owner's leg without calling this route at all.
 */
export async function POST(request: Request) {
  const url = new URL(request.url);
  const form = await request.formData();
  const params = new URLSearchParams();
  form.forEach((value, key) => params.set(key, String(value)));

  // Twilio signs the full callback URL, query string included.
  if (!validateTwilioSignature(request, params, `/api/retell/emergency-accept${url.search}`)) {
    return new Response("Invalid signature", { status: 403 });
  }

  const originalCallSid = url.searchParams.get("originalCallSid");
  const conference = url.searchParams.get("conference");
  if (params.get("Digits") !== "1" || !originalCallSid || !conference) {
    return xml(DECLINED_TWIML);
  }

  const room = `<Dial><Conference endConferenceOnExit="true">${xmlEscape(conference)}</Conference></Dial>`;
  try {
    await getVoiceProvider().redirectCall(originalCallSid, `<Response>${room}</Response>`);
  } catch {
    // The caller's call has already ended, so there is nobody to connect.
    return xml("<Response><Say>The caller is no longer on the line.</Say><Hangup/></Response>");
  }
  return xml(`<Response><Say>Connecting.</Say>${room}</Response>`);
}
