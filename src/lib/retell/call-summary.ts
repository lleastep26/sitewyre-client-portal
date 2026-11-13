import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { getSmsProvider } from "@/lib/adapters";
import { resolveSmsFrom } from "@/lib/a2p/sending";
import { findOrCreateContact } from "@/lib/crm/contacts";
import { normalizePhone } from "@/lib/utils";
import { localTimeLabel } from "@/lib/assistant/booking";

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

  // The lead the agent created or updated during the call — the most
  // recent one for this number, whatever its status (a booking made on
  // the call has already moved it to "booked").
  let lead: { id: string; name: string; contact_id: string | null } | null = null;
  if (phone) {
    const { data: recent } = await supabase
      .from("leads")
      .select("id, name, phone, contact_id")
      .eq("client_id", input.clientId)
      .order("created_at", { ascending: false })
      .limit(200);
    lead = (recent ?? []).find((l) => normalizePhone(l.phone) === phone) ?? null;
  }

  let contactId = lead?.contact_id ?? null;
  if (!contactId && phone) {
    const contact = await findOrCreateContact(supabase, {
      clientId: input.clientId,
      name: lead?.name ?? phone,
      phone,
      source: "ai_receptionist",
    });
    contactId = contact.id;
  }

  if (!lead) {
    const { data: stage } = await supabase
      .from("pipeline_stages")
      .select("id")
      .eq("client_id", input.clientId)
      .eq("name", "New")
      .maybeSingle();
    const { data: created } = await supabase
      .from("leads")
      .insert({
        client_id: input.clientId,
        contact_id: contactId,
        stage_id: stage?.id ?? null,
        name: "Unknown caller",
        phone: phone || "unknown",
        message: summary,
        source: "ai_receptionist",
        owner_id: client.user_id,
        last_activity_at: new Date().toISOString(),
      })
      .select("id, name, contact_id")
      .single();
    lead = created;
  } else {
    await supabase
      .from("leads")
      .update({ last_activity_at: new Date().toISOString() })
      .eq("id", lead.id);
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
  await supabase.from("workflow_runs").insert({
    client_id: input.clientId,
    trigger: AI_CALL_TRIGGER,
    status: "handled",
    log: {
      leadId: lead?.id ?? null,
      callId: input.callId,
      from: phone || null,
      summary,
      recordingUrl: input.recordingUrl,
      booked,
    },
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

  // The one owner text for this call.
  if (client.phone) {
    const who = lead?.name && lead.name !== "Unknown caller" ? lead.name : "Unknown caller";
    const body = [
      `AI receptionist took a call: ${who}${phone ? `, ${phone}` : ""}.`,
      summary.length > 280 ? `${summary.slice(0, 277)}...` : summary,
      booked ? `Booked: ${booked.service}, ${booked.local}.` : "No booking made.",
    ].join(" ");
    await getSmsProvider()
      .send({
        to: normalizePhone(client.phone),
        from: resolveSmsFrom(client) ?? undefined,
        body,
      })
      .catch(() => undefined);
  }

  return { recorded: true };
}
