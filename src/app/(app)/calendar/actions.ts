"use server";

import { revalidatePath } from "next/cache";
import { requireMembership } from "@/lib/auth/session";
import { inngest } from "@/lib/inngest/client";

export async function createAppointment(formData: FormData) {
  const { supabase, client, user } = await requireMembership();
  if (!client) return { error: "No client" };

  const title = String(formData.get("title") ?? "Appointment");
  const start = String(formData.get("start_at") ?? "");
  const end = String(formData.get("end_at") ?? "");
  if (!start || !end) return { error: "Start and end required" };

  const { data, error } = await supabase
    .from("appointments")
    .insert({
      client_id: client.id,
      title,
      start_at: new Date(start).toISOString(),
      end_at: new Date(end).toISOString(),
      assignee_ids: [user.id],
      status: "scheduled",
    })
    .select("*")
    .single();

  if (error) return { error: error.message };

  // schedule 24h reminder best-effort if phone provided later
  await inngest.send({
    name: "portal/appointment.reminder",
    data: {
      to: client.phone,
      from: client.twilio_phone_number,
      body: `Reminder: ${title} tomorrow for ${client.business_name}`,
    },
  }).catch(() => undefined);

  revalidatePath("/calendar");
  return { ok: true, id: data.id };
}

export async function rescheduleAppointment(input: {
  id: string;
  start_at: string;
  end_at: string;
}) {
  const { supabase, client } = await requireMembership();
  if (!client) return { error: "No client" };
  const { error } = await supabase
    .from("appointments")
    .update({
      start_at: input.start_at,
      end_at: input.end_at,
    })
    .eq("id", input.id)
    .eq("client_id", client.id);
  if (error) return { error: error.message };
  revalidatePath("/calendar");
  return { ok: true };
}
