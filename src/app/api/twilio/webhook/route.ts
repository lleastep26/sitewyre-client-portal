import { createAdminClient } from "@/lib/supabase/admin";
import { findOrCreateContact } from "@/lib/crm/contacts";
import { inngest } from "@/lib/inngest/client";
import { normalizePhone } from "@/lib/utils";
import twilio from "twilio";

function validateTwilio(request: Request, params: URLSearchParams) {
  const signature = request.headers.get("x-twilio-signature");
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const url = process.env.NEXT_PUBLIC_APP_URL
    ? `${process.env.NEXT_PUBLIC_APP_URL}/api/twilio/webhook`
    : request.url;
  if (!authToken || !signature) return process.env.NODE_ENV !== "production";
  const data: Record<string, string> = {};
  params.forEach((v, k) => {
    data[k] = v;
  });
  return twilio.validateRequest(authToken, signature, url, data);
}

export async function POST(request: Request) {
  const form = await request.formData();
  const params = new URLSearchParams();
  form.forEach((value, key) => params.set(key, String(value)));

  if (!validateTwilio(request, params)) {
    return new Response("Invalid signature", { status: 403 });
  }

  const supabase = createAdminClient();
  const to = normalizePhone(params.get("To") ?? "");
  const from = normalizePhone(params.get("From") ?? "");
  const body = params.get("Body") ?? "";
  const callSid = params.get("CallSid");
  const callStatus = params.get("CallStatus");
  const messageSid = params.get("MessageSid");

  const { data: client } = await supabase
    .from("clients")
    .select("*")
    .eq("twilio_phone_number", to)
    .maybeSingle();

  if (!client) {
    return new Response("<Response></Response>", {
      headers: { "Content-Type": "text/xml" },
    });
  }

  // Missed / no-answer call
  if (callSid && (callStatus === "no-answer" || callStatus === "busy" || params.get("DialCallStatus") === "no-answer")) {
    await supabase.from("calls").insert({
      client_id: client.id,
      direction: "inbound",
      missed: true,
      twilio_call_sid: callSid,
      duration: Number(params.get("CallDuration") ?? 0) || null,
    });
    await inngest.send({
      name: "portal/call.missed",
      data: { clientId: client.id, from },
    });
  }

  // Inbound SMS
  if (messageSid && body) {
    const contact = await findOrCreateContact(supabase, {
      clientId: client.id,
      name: from,
      phone: from,
      source: "sms",
    });

    const upper = body.trim().toUpperCase();
    if (["STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT"].includes(upper)) {
      await supabase
        .from("contacts")
        .update({ sms_opt_in: false })
        .eq("id", contact.id);
    }
    if (upper === "HELP") {
      // acknowledged by carrier templates typically
    }

    await supabase.from("messages").insert({
      client_id: client.id,
      contact_id: contact.id,
      channel: "sms",
      direction: "inbound",
      body,
      status: "received",
      external_id: messageSid,
    });

    await supabase.from("activities").insert({
      client_id: client.id,
      contact_id: contact.id,
      type: "sms_inbound",
      payload: { body, messageSid },
    });
  }

  return new Response("<Response></Response>", {
    headers: { "Content-Type": "text/xml" },
  });
}
