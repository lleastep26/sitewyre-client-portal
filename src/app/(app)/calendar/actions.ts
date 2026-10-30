"use server";

import { revalidatePath } from "next/cache";
import { requireMembership } from "@/lib/auth/session";
import { enqueueAppointmentSms } from "@/lib/scheduling/reminders";
import { ensureDefaultAvailability } from "@/lib/scheduling/availability";

export async function createAppointment(formData: FormData) {
  const { supabase, client, user } = await requireMembership();
  if (!client) return { error: "No client" };

  const title = String(formData.get("title") ?? "Appointment");
  const start = String(formData.get("start_at") ?? "");
  const end = String(formData.get("end_at") ?? "");
  const assigneeId =
    String(formData.get("assignee_id") ?? "").trim() || user.id;
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
      title,
      start_at: startAt.toISOString(),
      end_at: endAt.toISOString(),
      assignee_ids: [assigneeId],
      status: "scheduled",
    })
    .select("*")
    .single();

  if (error) return { error: error.message };

  await enqueueAppointmentSms({
    to: client.phone,
    from: client.twilio_phone_number,
    businessName: client.business_name ?? "us",
    title,
    startAt,
  });

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
  revalidatePath("/calendar");
  return { ok: true };
}

export async function updateAppointmentStatus(id: string, status: string) {
  const { supabase, client } = await requireMembership();
  if (!client) return { error: "No client" };
  const { error } = await supabase
    .from("appointments")
    .update({ status })
    .eq("id", id)
    .eq("client_id", client.id);
  if (error) return { error: error.message };
  revalidatePath("/calendar");
  return { ok: true };
}

export async function ensureCalendarAvailability() {
  const { supabase, client, user } = await requireMembership();
  if (!client) return;
  const ownerId = client.user_id ?? user.id;
  await ensureDefaultAvailability(supabase, client.id, ownerId).catch(
    () => undefined,
  );
}
