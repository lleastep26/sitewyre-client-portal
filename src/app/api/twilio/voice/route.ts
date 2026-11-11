import { createAdminClient } from "@/lib/supabase/admin";
import { normalizePhone } from "@/lib/utils";
import { validateTwilioSignature } from "@/lib/twilio/validate";
import { getAppUrl } from "@/lib/supabase/env";

const EMPTY_TWIML = "<Response></Response>";

function xml(body: string) {
  return new Response(body, { headers: { "Content-Type": "text/xml" } });
}

/**
 * The Voice URL set on every purchased number. Dials forward_to_phone with
 * a 20s timeout; the `action` callback posts DialCallStatus back to the
 * existing SMS/status webhook, which already detects no-answer/busy there
 * (it was built expecting a Dial action callback, not a separate route).
 */
export async function POST(request: Request) {
  const form = await request.formData();
  const params = new URLSearchParams();
  form.forEach((value, key) => params.set(key, String(value)));

  if (!validateTwilioSignature(request, params, "/api/twilio/voice")) {
    return new Response("Invalid signature", { status: 403 });
  }

  const to = normalizePhone(params.get("To") ?? "");
  const supabase = createAdminClient();
  const { data: client } = await supabase
    .from("clients")
    .select("forward_to_phone, dial_timeout_seconds")
    .eq("twilio_phone_number", to)
    .maybeSingle();

  if (!client?.forward_to_phone) {
    return xml(EMPTY_TWIML);
  }

  const forward = normalizePhone(client.forward_to_phone);
  const timeout = client.dial_timeout_seconds ?? 15;
  const actionUrl = `${getAppUrl()}/api/twilio/webhook`;
  return xml(
    `<Response><Dial timeout="${timeout}" action="${actionUrl}"><Number>${forward}</Number></Dial></Response>`,
  );
}
