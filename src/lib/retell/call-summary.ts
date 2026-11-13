import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { getSmsProvider } from "@/lib/adapters";
import { resolveOwnerAlertFrom } from "@/lib/a2p/sending";
import { findContactByPhone, findOrCreateContact } from "@/lib/crm/contacts";
import { normalizePhone } from "@/lib/utils";
import { localTimeLabel } from "@/lib/assistant/booking";
import { createCallLead, findLeadForCall, touchCallLead } from "./call-lead";

type Admin = SupabaseClient<Database>;

export const AI_CALL_TRIGGER = "ai_receptionist_call";

export type AiCallOutcomeInput = {
  clientId: string;
  /** Retell's call id — the idempotency key for everything below. */
  callId: string;
  callerNumber: string | null;
  twilioCallSid: string | null;
  /** Retell's post-call summary; null when analysis never arrived. */
  summary: string | null;
  recordingUrl: string | null;
  /** Call start, ms since epoch — used to find a booking made during the call. */
  startTimestamp: number | null;
};

/**
 * After an AI-handled call: saves the summary and recording link on the
 * caller's lead (creating the lead if the agent never did), logs the call
 * in the inbox thread, and sends the owner exactly one text with who
 * called, what they need, and any booking made during the call.
 *
 * Safe to call more than once for the same call — the first caller wins.
 */
export async function recordAiCallOutcome(
  supabase: Admin,
  input: AiCallOutcomeInput,
): Promise<{ recorded: boolean }> {
  const { data: already } = await supabase
    .from("workflow_runs")
    .select("id")
    .eq("client_id", input.clientId)
    .eq("trigger", AI_CALL_TRIGGER)
    .contains("log", { callId: input.callId })
    .limit(1);
  if (already?.length) return { recorded: false };

  const { data: client } = await supabase
    .from("clients")
    .select("*")
    .eq("id", input.clientId)
    .maybeSingle();
  if (!client) return { recorded: false };

  const phone = normalizePhone(input.callerNumber ?? "");
  const summary = input.summary?.trim() || "No summary was available for this call.";

  // The lead this call belongs to: the one the agent saved during the
  // call (a booking may already have moved it to "booked"), or the
  // caller's still-live open lead. An old lead for the same number is
  // left alone, so the call gets a new lead instead of disappearing into it.
  const callStartedAt = input.startTimestamp ? new Date(input.startTimestamp) : null;
  let lead: { id: string; name: string; contact_id: string | null } | null = null;
  // Matched on the caller's contact as well as the number, because the
  // caller may have asked to be reached on a different number.
  const knownContact = phone ? await findContactByPhone(supabase, input.clientId, phone) : null;
  const existing = phone
    ? await findLeadForCall(supabase, input.clientId, phone, {
        callStartedAt,
        contactId: knownContact?.id ?? null,
      })
    : null;

  let contactId = existing?.contact_id ?? null;
  let contactName: string | null = null;
  if (!contactId && phone) {
    const contact = await findOrCreateContact(supabase, {
      clientId: input.clientId,
      name: existing?.name ?? phone,
      phone,
      source: "ai_receptionist",
    });
    contactId = contact.id;
    // A contact made just now is named after the number: not a real name.
    contactName = contact.name && contact.name !== phone ? contact.name : null;
  }

  if (existing) {
    await touchCallLead(supabase, input.clientId, existing, { contactId });
    lead = { id: existing.id, name: existing.name, contact_id: existing.contact_id ?? contactId };
  } else {
    const created = await createCallLead(supabase, {
      client,
      contactId,
      name: contactName,
      phone,
      message: summary,
    });
    lead = created.lead;
  }

  // A booking made during this call, if any.
  let booked: { service: string; local: string } | null = null;
  if (contactId && input.startTimestamp) {
    const { data: appt } = await supabase
      .from("appointments")
      .select("title, start_at")
      .eq("client_id", input.clientId)
      .eq("contact_id", contactId)
      .neq("status", "cancelled")
      .gte("created_at", new Date(input.startTimestamp).toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (appt) {
      booked = {
        service: appt.title ?? "Appointment",
        local: localTimeLabel(new Date(appt.start_at), client.timezone ?? "America/Chicago"),
      };
    }
  }

  // Shows on the lead's timeline, and marks this call as recorded.
  const log = {
    leadId: lead?.id ?? null,
    callId: input.callId,
    from: phone || null,
    summary,
    recordingUrl: input.recordingUrl,
    booked,
  };
  await supabase.from("workflow_runs").insert({
    client_id: input.clientId,
    trigger: AI_CALL_TRIGGER,
    status: "handled",
    log,
  });

  if (contactId) {
    await supabase.from("messages").insert({
      client_id: input.clientId,
      contact_id: contactId,
      channel: "call",
      direction: "inbound",
      body: `AI receptionist call — ${summary}${input.recordingUrl ? `\nRecording: ${input.recordingUrl}` : ""}`,
      status: "received",
      external_id: input.callId,
    });
  }

  if (input.twilioCallSid) {
    await supabase
      .from("calls")
      .update({
        ai_handled: true,
        ...(input.recordingUrl ? { recording_url: input.recordingUrl } : {}),
        ...(contactId ? { contact_id: contactId } : {}),
      })
      .eq("twilio_call_sid", input.twilioCallSid);
  }

  // The one owner text for this call. It goes out from Sitewyre's
  // registered sender until the client's own number is approved, and
  // what happened to it is saved on the call's log entry.
  let ownerText: "sent" | "failed" | "no_owner_phone" = "no_owner_phone";
  if (client.phone) {
    const who = lead?.name && lead.name !== "Unknown caller" ? lead.name : "Unknown caller";
    const body = [
      `AI receptionist took a call for ${client.business_name ?? "your business"}: ${who}${phone ? `, ${phone}` : ""}.`,
      summary.length > 280 ? `${summary.slice(0, 277)}...` : summary,
      booked ? `Booked: ${booked.service}, ${booked.local}.` : "No booking made.",
    ].join(" ");
    ownerText = await getSmsProvider()
      .send({
        to: normalizePhone(client.phone),
        from: resolveOwnerAlertFrom(client),
        body,
      })
      .then(() => "sent" as const)
      .catch(() => "failed" as const);
  }
  await supabase
    .from("workflow_runs")
    .update({ log: { ...log, ownerText } })
    .eq("client_id", input.clientId)
    .eq("trigger", AI_CALL_TRIGGER)
    .contains("log", { callId: input.callId });

  return { recorded: true };
}
