import { createAdminClient } from "@/lib/supabase/admin";
import { findOrCreateContact } from "@/lib/crm/contacts";
import { inngest } from "@/lib/inngest/client";
import { sendPushToClient } from "@/lib/push/web-push";
import { normalizePhone } from "@/lib/utils";
import { addOptOut, removeOptOut } from "@/lib/funnels/opt-out";
import { validateTwilioSignature } from "@/lib/twilio/validate";
import { getSmsProvider } from "@/lib/adapters";
import { resolveSmsFrom } from "@/lib/a2p/sending";
import {
  findOpenLeadForPhone,
  isOwnerPhone,
  setLeadLifecycleStatus,
} from "@/lib/leads/lifecycle";

// Exact whole-message match only, trimmed + case-insensitive — "Stop by
// Thursday" must never match. START/UNSTOP are the opt-back-in keywords;
// YES is deliberately excluded since it's already used below to confirm an
// appointment, and treating it as opt-back-in too would conflict with that.
const STOP_KEYWORDS = ["STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT"];
const START_KEYWORDS = ["START", "UNSTOP"];

function validateTwilio(request: Request, params: URLSearchParams) {
  return validateTwilioSignature(request, params, "/api/twilio/webhook");
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

    // Lead-reply detection: cancels that lead's follow-up drip and alerts
    // the owner. Never triggered by the owner's own phone texting in
    // (e.g. replying to their own lead-alert SMS) — that's not a lead
    // replying.
    if (!isOwnerPhone(client, from)) {
      const openLead = await findOpenLeadForPhone(supabase, client.id, from);
      if (openLead) {
        await setLeadLifecycleStatus(supabase, openLead.id, "replied");
        await inngest
          .send({
            name: "portal/lead.replied",
            data: { clientId: client.id, leadId: openLead.id },
          })
          .catch(() => undefined);

        const ownerFrom = resolveSmsFrom(client);
        if (client.phone && ownerFrom) {
          await getSmsProvider()
            .send({
              to: normalizePhone(client.phone),
              from: ownerFrom,
              body: `${openLead.name} replied: ${body.slice(0, 120)} — reply in your portal inbox.`,
            })
            .catch(() => undefined);
        }
      }
    }

    const upper = body.trim().toUpperCase();
    if (STOP_KEYWORDS.includes(upper)) {
      await supabase
        .from("contacts")
        .update({ sms_opt_in: false })
        .eq("id", contact.id);
      await addOptOut(supabase, client.id, from);
    }
    if (START_KEYWORDS.includes(upper)) {
      await supabase
        .from("contacts")
        .update({ sms_opt_in: true })
        .eq("id", contact.id);
      await removeOptOut(supabase, client.id, from);
    }
    if (upper === "HELP") {
      // acknowledged by carrier templates typically
    }

    // Reply C / CONFIRM → mark next upcoming appointment confirmed
    if (upper === "C" || upper === "CONFIRM" || upper === "YES") {
      const nowIso = new Date().toISOString();
      const { data: nextAppt } = await supabase
        .from("appointments")
        .select("id")
        .eq("client_id", client.id)
        .eq("contact_id", contact.id)
        .neq("status", "cancelled")
        .neq("status", "completed")
        .gte("start_at", nowIso)
        .order("start_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (nextAppt) {
        await supabase
          .from("appointments")
          .update({ status: "confirmed" })
          .eq("id", nextAppt.id);
        await supabase.from("activities").insert({
          client_id: client.id,
          contact_id: contact.id,
          type: "appointment_confirmed_sms",
          payload: { appointmentId: nextAppt.id, body },
        });
        await sendPushToClient(client.id, {
          title: `${client.business_name ?? "Booking"} confirmed`,
          body: `${contact.name || from} replied ${upper}`,
          url: "/calendar",
        }).catch(() => undefined);
      }
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

    await sendPushToClient(client.id, {
      title: `SMS — ${client.business_name ?? "Sitewyre"}`,
      body: body.slice(0, 120),
      url: `/inbox?contact=${contact.id}`,
    }).catch(() => undefined);
  }

  return new Response("<Response></Response>", {
    headers: { "Content-Type": "text/xml" },
  });
}
