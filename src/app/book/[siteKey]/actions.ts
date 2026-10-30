"use server";

import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { findOrCreateContact } from "@/lib/crm/contacts";
import { inngest } from "@/lib/inngest/client";
import { normalizePhone } from "@/lib/utils";

export async function bookAppointment(siteKey: string, formData: FormData) {
  const supabase = createAdminClient();
  const { data: client } = await supabase
    .from("clients")
    .select("*")
    .eq("site_key", siteKey)
    .single();
  if (!client) return;

  const name = String(formData.get("name") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim() || null;
  const serviceId = String(formData.get("service_id") ?? "");
  const startAt = String(formData.get("start_at") ?? "");

  const { data: service } = await supabase
    .from("services")
    .select("*")
    .eq("id", serviceId)
    .eq("client_id", client.id)
    .single();

  const contact = await findOrCreateContact(supabase, {
    clientId: client.id,
    name,
    phone,
    email,
    source: "booking_page",
  });

  const start = new Date(startAt);
  const end = new Date(
    start.getTime() + (service?.duration_minutes ?? 60) * 60000,
  );

  await supabase.from("appointments").insert({
    client_id: client.id,
    contact_id: contact.id,
    service_id: service?.id ?? null,
    title: service?.name ?? "Booking",
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

  if (client.twilio_phone_number) {
    await inngest.send({
      name: "portal/appointment.reminder",
      data: {
        to: normalizePhone(phone),
        from: client.twilio_phone_number,
        body: `You're booked with ${client.business_name} on ${start.toLocaleString()}. Reply C to confirm.`,
      },
    });
  }

  redirect(`/book/${siteKey}?booked=1`);
}
