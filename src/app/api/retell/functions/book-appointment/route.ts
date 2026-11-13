import { createAdminClient } from "@/lib/supabase/admin";
import {
  readVerifiedRetellBody,
  clientIdFromCall,
  jsonResult,
  type RetellFunctionCallBody,
} from "@/lib/retell/webhook";
import { findOrCreateContact } from "@/lib/crm/contacts";
import { normalizePhone } from "@/lib/utils";
import { isSlotAvailable } from "@/lib/scheduling/slots";
import { getExternalBusyTimes, pushAppointmentCreated } from "@/lib/scheduling/calendar-sync";
import { enqueueAppointmentSms } from "@/lib/scheduling/reminders";
import { resolveSmsFrom } from "@/lib/a2p/sending";
import { handleLeadBookedForContact } from "@/lib/leads/lifecycle";
import { inngest } from "@/lib/inngest/client";

export async function POST(request: Request) {
  const raw = await readVerifiedRetellBody(request);
  if (!raw) return new Response("Invalid signature", { status: 401 });
  const body = JSON.parse(raw) as RetellFunctionCallBody;

  const clientId = clientIdFromCall(body.call);
  if (!clientId) return jsonResult({ error: "Unknown client." });

  const supabase = createAdminClient();
  const { data: client } = await supabase.from("clients").select("*").eq("id", clientId).maybeSingle();
  if (!client) return jsonResult({ error: "Unknown client." });

  if (!client.ai_receptionist_booking_enabled) {
    return jsonResult({
      error: "Booking isn't enabled for this business — take a message instead with create_or_update_lead.",
    });
  }

  const serviceName = String(body.args.service_name ?? "").trim();
  const callerName = String(body.args.caller_name ?? "").trim();
  const startAt = new Date(String(body.args.start_at ?? ""));
  const metadataPhone =
    typeof body.call.metadata?.caller_number === "string" ? body.call.metadata.caller_number : "";
  const callerPhoneRaw =
    typeof body.args.caller_phone === "string" && body.args.caller_phone ? body.args.caller_phone : metadataPhone;
  const callerPhone = normalizePhone(callerPhoneRaw);

  if (!serviceName || !callerName || Number.isNaN(startAt.getTime())) {
    return jsonResult({ error: "Need the service, caller name, and a valid start time." });
  }

  const { data: service } = await supabase
    .from("services")
    .select("id, name, duration_minutes")
    .eq("client_id", clientId)
    .eq("bookable_online", true)
    .ilike("name", `%${serviceName}%`)
    .maybeSingle();
  if (!service) {
    return jsonResult({ error: `No bookable service matching "${serviceName}".` });
  }

  const endAt = new Date(startAt.getTime() + service.duration_minutes * 60_000);
  const timeZone = client.timezone ?? "America/Chicago";

  const { data: availability } = await supabase
    .from("availability")
    .select("weekday, start_time, end_time, buffer_minutes, min_notice_hours")
    .eq("client_id", clientId);
  const { data: existingAppointments } = await supabase
    .from("appointments")
    .select("start_at, end_at")
    .eq("client_id", clientId)
    .neq("status", "cancelled")
    .lt("start_at", endAt.toISOString())
    .gt("end_at", startAt.toISOString());
  const externalBusy = await getExternalBusyTimes(supabase, clientId, startAt, endAt);

  const stillFree = isSlotAvailable({
    start: startAt,
    durationMinutes: service.duration_minutes,
    availability: availability ?? [],
    busy: [...(existingAppointments ?? []), ...externalBusy],
    timeZone,
  });
  if (!stillFree) {
    return jsonResult({
      error: "That time just filled up — call check_availability again for other open times.",
    });
  }

  let contactId: string | null = null;
  if (callerPhone) {
    const contact = await findOrCreateContact(supabase, {
      clientId,
      name: callerName,
      phone: callerPhone,
      source: "ai_receptionist",
    });
    contactId = contact.id;
  }

  const { data: appt, error } = await supabase
    .from("appointments")
    .insert({
      client_id: clientId,
      contact_id: contactId,
      title: service.name,
      start_at: startAt.toISOString(),
      end_at: endAt.toISOString(),
      assignee_ids: client.user_id ? [client.user_id] : [],
      status: "scheduled",
    })
    .select("*")
    .single();
  if (error) return jsonResult({ error: error.message });

  await handleLeadBookedForContact(
    supabase,
    { clientId, contactId, appointmentId: appt.id },
    (event) => inngest.send(event),
  );
  await pushAppointmentCreated(supabase, clientId, {
    id: appt.id,
    title: service.name,
    startAt,
    endAt,
  });
  if (client.phone) {
    await enqueueAppointmentSms({
      to: client.phone,
      from: resolveSmsFrom(client),
      businessName: client.business_name ?? "us",
      title: service.name,
      startAt,
      clientId,
      timeZone,
    }).catch(() => undefined);
  }

  return jsonResult({ ok: true, appointment_id: appt.id, start_at: startAt.toISOString() });
}
