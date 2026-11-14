"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { verifyPortalFormTurnstile } from "@/lib/security/turnstile";
import { createAdminClient } from "@/lib/supabase/admin";
import { findOrCreateContact } from "@/lib/crm/contacts";
import { isSlotAvailable } from "@/lib/scheduling/slots";
import { enqueueAppointmentSms } from "@/lib/scheduling/reminders";
import { ensureDefaultAvailability } from "@/lib/scheduling/availability";
import { sendPushToClient } from "@/lib/push/web-push";
import { resolveSmsFrom } from "@/lib/a2p/sending";
import { handleLeadBookedForContact } from "@/lib/leads/lifecycle";
import { inngest } from "@/lib/inngest/client";
import { getExternalBusyTimes, pushAppointmentCreated } from "@/lib/scheduling/calendar-sync";

export async function bookAppointment(siteKey: string, formData: FormData) {
  const supabase = createAdminClient();
  const { data: client } = await supabase
    .from("clients")
    .select("*")
    .eq("site_key", siteKey)
    .single();
  if (!client) return { error: "Business not found" };

  const name = String(formData.get("name") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim() || null;
  const serviceId = String(formData.get("service_id") ?? "");
  const startAt = String(formData.get("start_at") ?? "");

  if (!name || !phone || !serviceId || !startAt) {
    return { error: "Name, phone, service, and time are required" };
  }

  // Bot check, when Turnstile is set up. This form is hosted by the
  // portal (also when framed on a client's site), so Turnstile can run.
  const requestHeaders = await headers();
  const botCheck = await verifyPortalFormTurnstile(
    formData.get("turnstile_token"),
    requestHeaders.get("cf-connecting-ip") ??
      requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim(),
  );
  if (!botCheck.ok) {
    return { error: "Please complete the security check and try again." };
  }

  const { data: service } = await supabase
    .from("services")
    .select("*")
    .eq("id", serviceId)
    .eq("client_id", client.id)
    .eq("bookable_online", true)
    .single();
  if (!service) return { error: "Service not available" };

  if (client.user_id) {
    await ensureDefaultAvailability(supabase, client.id, client.user_id).catch(
      () => undefined,
    );
  }

  const { data: availability } = await supabase
    .from("availability")
    .select("weekday, start_time, end_time, buffer_minutes, min_notice_hours")
    .eq("client_id", client.id);

  const start = new Date(startAt);
  if (Number.isNaN(start.getTime())) return { error: "Invalid time" };
  const duration = service.duration_minutes ?? 60;
  const end = new Date(start.getTime() + duration * 60_000);

  const { data: appointments } = await supabase
    .from("appointments")
    .select("start_at, end_at")
    .eq("client_id", client.id)
    .neq("status", "cancelled")
    .lt("start_at", end.toISOString())
    .gt("end_at", start.toISOString());

  const externalBusy = await getExternalBusyTimes(supabase, client.id, start, end);

  const free = isSlotAvailable({
    start,
    durationMinutes: duration,
    availability: availability ?? [],
    busy: [...(appointments ?? []), ...externalBusy],
    timeZone: client.timezone ?? "America/Chicago",
  });
  if (!free) {
    return { error: "That time was just taken. Pick another slot." };
  }

  const contact = await findOrCreateContact(supabase, {
    clientId: client.id,
    name,
    phone,
    email,
    source: "booking_page",
  });

  const title = service.name ?? "Booking";
  const { data: appointment } = await supabase
    .from("appointments")
    .insert({
      client_id: client.id,
      contact_id: contact.id,
      service_id: service.id,
      title,
      start_at: start.toISOString(),
      end_at: end.toISOString(),
      status: "scheduled",
      assignee_ids: client.user_id ? [client.user_id] : [],
    })
    .select("id")
    .single();

  if (appointment) {
    await handleLeadBookedForContact(
      supabase,
      { clientId: client.id, contactId: contact.id, appointmentId: appointment.id },
      (event) => inngest.send(event),
    );
    await pushAppointmentCreated(supabase, client.id, {
      id: appointment.id,
      title,
      startAt: start,
      endAt: end,
    });
  }

  await supabase.from("jobs").insert({
    client_id: client.id,
    contact_id: contact.id,
    status: "scheduled",
    scheduled_start: start.toISOString(),
    scheduled_end: end.toISOString(),
    assignee_ids: client.user_id ? [client.user_id] : [],
    checklist: [
      { id: "1", label: "Arrive on site", done: false },
      { id: "2", label: "Complete work", done: false },
      { id: "3", label: "Collect photos", done: false },
    ],
  });

  await enqueueAppointmentSms({
    to: phone,
    from: resolveSmsFrom(client)!,
    businessName: client.business_name ?? "us",
    title,
    startAt: start,
    clientId: client.id,
    timeZone: client.timezone,
  });

  await sendPushToClient(client.id, {
    title: `New booking — ${client.business_name ?? "Sitewyre"}`,
    body: `${name} · ${title} · ${start.toLocaleString()}`,
    url: "/calendar",
  }).catch(() => undefined);

  // A booking made inside the frame on the business's own website stays
  // in the frame.
  redirect(`${formData.get("embed") === "1" ? "/embed/book" : "/book"}/${siteKey}?booked=1`);
}
