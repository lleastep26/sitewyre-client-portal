"use server";

import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { findOrCreateContact } from "@/lib/crm/contacts";
import { isSlotAvailable } from "@/lib/scheduling/slots";
import { enqueueAppointmentSms } from "@/lib/scheduling/reminders";
import { ensureDefaultAvailability } from "@/lib/scheduling/availability";

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

  const free = isSlotAvailable({
    start,
    durationMinutes: duration,
    availability: availability ?? [],
    busy: appointments ?? [],
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
  await supabase.from("appointments").insert({
    client_id: client.id,
    contact_id: contact.id,
    service_id: service.id,
    title,
    start_at: start.toISOString(),
    end_at: end.toISOString(),
    status: "scheduled",
    assignee_ids: client.user_id ? [client.user_id] : [],
  });

  await supabase.from("jobs").insert({
    client_id: client.id,
    contact_id: contact.id,
    status: "scheduled",
    scheduled_start: start.toISOString(),
    scheduled_end: end.toISOString(),
    assignee_ids: client.user_id ? [client.user_id] : [],
    checklist: [],
  });

  await enqueueAppointmentSms({
    to: phone,
    from: client.twilio_phone_number,
    businessName: client.business_name ?? "us",
    title,
    startAt: start,
  });

  redirect(`/book/${siteKey}?booked=1`);
}
