"use server";

import { revalidatePath } from "next/cache";
import { requireMembership } from "@/lib/auth/session";
import { enqueueAppointmentSms } from "@/lib/scheduling/reminders";
import { ensureDefaultAvailability } from "@/lib/scheduling/availability";
import { sendPushToClient } from "@/lib/push/web-push";
import { resolveSmsFrom } from "@/lib/a2p/sending";
import { getSmsProvider } from "@/lib/adapters";
import { handleLeadBookedForContact, setLeadLifecycleStatus } from "@/lib/leads/lifecycle";
import { applyTemplate } from "@/lib/automations";
import { inngest } from "@/lib/inngest/client";
import {
  pushAppointmentCreated,
  pushAppointmentDeleted,
  pushAppointmentUpdated,
} from "@/lib/scheduling/calendar-sync";

export async function createAppointment(formData: FormData) {
  const { supabase, client, user } = await requireMembership();
  if (!client) return { error: "No client" };

  const title = String(formData.get("title") ?? "Appointment");
  const start = String(formData.get("start_at") ?? "");
  const end = String(formData.get("end_at") ?? "");
  const assigneeId =
    String(formData.get("assignee_id") ?? "").trim() || user.id;
  const contactId = String(formData.get("contact_id") ?? "").trim() || null;
  if (!start || !end) return { error: "Start and end required" };

  const startAt = new Date(start);
  const endAt = new Date(end);
  if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime())) {
    return { error: "Invalid times" };
  }

  const { data, error } = await supabase
    .from("appointments")
    .insert({
      client_id: client.id,
      contact_id: contactId,
      title,
      start_at: startAt.toISOString(),
      end_at: endAt.toISOString(),
      assignee_ids: [assigneeId],
      status: "scheduled",
    })
    .select("*")
    .single();

  if (error) return { error: error.message };

  await handleLeadBookedForContact(
    supabase,
    { clientId: client.id, contactId, appointmentId: data.id },
    (event) => inngest.send(event),
  );

  await pushAppointmentCreated(supabase, client.id, {
    id: data.id,
    title,
    startAt,
    endAt,
  });

  await enqueueAppointmentSms({
    to: client.phone,
    from: resolveSmsFrom(client)!,
    businessName: client.business_name ?? "us",
    title,
    startAt,
    clientId: client.id,
    timeZone: client.timezone,
  });

  await sendPushToClient(client.id, {
    title: `Appointment added — ${client.business_name ?? "Sitewyre"}`,
    body: `${title} · ${startAt.toLocaleString()}`,
    url: "/calendar",
  }).catch(() => undefined);

  revalidatePath("/calendar");
  return { ok: true, id: data.id };
}

export async function rescheduleAppointment(input: {
  id: string;
  start_at: string;
  end_at: string;
  title?: string;
  assignee_id?: string | null;
  status?: string;
}) {
  const { supabase, client } = await requireMembership();
  if (!client) return { error: "No client" };

  const { data: existing } = await supabase
    .from("appointments")
    .select("title, external_event_id, external_calendar_provider")
    .eq("id", input.id)
    .eq("client_id", client.id)
    .maybeSingle();

  const { error } = await supabase
    .from("appointments")
    .update({
      start_at: input.start_at,
      end_at: input.end_at,
      ...(input.title != null ? { title: input.title } : {}),
      ...(input.status ? { status: input.status } : {}),
      ...(input.assignee_id !== undefined
        ? { assignee_ids: input.assignee_id ? [input.assignee_id] : [] }
        : {}),
    })
    .eq("id", input.id)
    .eq("client_id", client.id);
  if (error) return { error: error.message };

  if (input.status === "cancelled") {
    await pushAppointmentDeleted(
      supabase,
      client.id,
      input.id,
      existing?.external_event_id ?? null,
      existing?.external_calendar_provider ?? null,
    );
  } else if (existing) {
    await pushAppointmentUpdated(supabase, client.id, {
      id: input.id,
      title: input.title ?? existing.title ?? "Appointment",
      startAt: new Date(input.start_at),
      endAt: new Date(input.end_at),
      externalEventId: existing.external_event_id,
      externalProvider: existing.external_calendar_provider,
    });
  }

  revalidatePath("/calendar");
  return { ok: true };
}

export async function updateAppointmentStatus(id: string, status: string) {
  const { supabase, client } = await requireMembership();
  if (!client) return { error: "No client" };

  const { data: existing } =
    status === "cancelled"
      ? await supabase
          .from("appointments")
          .select("external_event_id, external_calendar_provider")
          .eq("id", id)
          .eq("client_id", client.id)
          .maybeSingle()
      : { data: null };

  const { error } = await supabase
    .from("appointments")
    .update({ status })
    .eq("id", id)
    .eq("client_id", client.id);
  if (error) return { error: error.message };

  if (status === "no_show") {
    await handleNoShow(supabase, client, id).catch(() => undefined);
  }

  if (status === "cancelled") {
    await pushAppointmentDeleted(
      supabase,
      client.id,
      id,
      existing?.external_event_id ?? null,
      existing?.external_calendar_provider ?? null,
    );
  }

  revalidatePath("/calendar");
  return { ok: true };
}

async function handleNoShow(
  supabase: Awaited<ReturnType<typeof requireMembership>>["supabase"],
  client: NonNullable<Awaited<ReturnType<typeof requireMembership>>["client"]>,
  appointmentId: string,
) {
  const { data: appointment } = await supabase
    .from("appointments")
    .select("contact_id, title")
    .eq("id", appointmentId)
    .maybeSingle();
  if (!appointment?.contact_id) return;

  const { data: lead } = await supabase
    .from("leads")
    .select("id")
    .eq("client_id", client.id)
    .eq("contact_id", appointment.contact_id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (lead) await setLeadLifecycleStatus(supabase, lead.id, "no_show");

  const { data: contact } = await supabase
    .from("contacts")
    .select("phones")
    .eq("id", appointment.contact_id)
    .maybeSingle();
  const phone = contact?.phones?.[0];
  const from = resolveSmsFrom(client);
  if (!phone || !from) return;

  const body = applyTemplate(
    "Hi, we missed you for your {{title}} appointment with {{business_name}} — give us a call to reschedule.",
    { title: appointment.title ?? "scheduled", business_name: client.business_name ?? "us" },
  );
  await getSmsProvider().send({ to: phone, from, body });
}

export async function ensureCalendarAvailability() {
  const { supabase, client, user } = await requireMembership();
  if (!client) return;
  const ownerId = client.user_id ?? user.id;
  await ensureDefaultAvailability(supabase, client.id, ownerId).catch(
    () => undefined,
  );
}
