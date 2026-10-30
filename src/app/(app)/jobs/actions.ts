"use server";

import { revalidatePath } from "next/cache";
import { requireMembership } from "@/lib/auth/session";
import { getSmsProvider } from "@/lib/adapters";
import { inngest } from "@/lib/inngest/client";

export async function createJob(formData: FormData) {
  const { supabase, client, user } = await requireMembership();
  if (!client) return { error: "No client" };
  const address = String(formData.get("address") ?? "").trim();
  const start = String(formData.get("scheduled_start") ?? "");
  const { error } = await supabase.from("jobs").insert({
    client_id: client.id,
    address: address || null,
    scheduled_start: start ? new Date(start).toISOString() : null,
    status: "scheduled",
    assignee_ids: [user.id],
    checklist: [
      { id: "1", label: "Arrive on site", done: false },
      { id: "2", label: "Complete work", done: false },
      { id: "3", label: "Collect photos", done: false },
    ],
  });
  if (error) return { error: error.message };
  revalidatePath("/jobs");
  return { ok: true };
}

export async function updateJobStatus(input: {
  jobId: string;
  status: string;
  contactPhone?: string | null;
}) {
  const { supabase, client } = await requireMembership();
  if (!client) return { error: "No client" };

  const { error } = await supabase
    .from("jobs")
    .update({ status: input.status, updated_at: new Date().toISOString() })
    .eq("id", input.jobId)
    .eq("client_id", client.id);
  if (error) return { error: error.message };

  if (input.status === "en_route" && input.contactPhone && client.twilio_phone_number) {
    await getSmsProvider().send({
      to: input.contactPhone,
      from: client.twilio_phone_number,
      body: `${client.business_name}: we're on the way.`,
    });
    await supabase.from("workflow_runs").insert({
      client_id: client.id,
      trigger: "on_my_way",
      status: "sent",
      log: { jobId: input.jobId },
    });
  }

  if (input.status === "complete") {
    await inngest.send({
      name: "portal/appointment.reminder",
      data: {
        to: input.contactPhone,
        from: client.twilio_phone_number,
        body: `Thanks for choosing ${client.business_name}! Mind leaving a quick review? ${client.google_review_url ?? ""}`.trim(),
      },
    }).catch(() => undefined);
    await supabase.from("workflow_runs").insert({
      client_id: client.id,
      trigger: "review_request",
      status: "sent",
      log: { jobId: input.jobId },
    });
  }

  revalidatePath("/jobs");
  revalidatePath("/crew");
  return { ok: true };
}

export async function toggleChecklistItem(input: {
  jobId: string;
  itemId: string;
  done: boolean;
}) {
  const { supabase, client } = await requireMembership();
  if (!client) return { error: "No client" };
  const { data: job } = await supabase
    .from("jobs")
    .select("checklist")
    .eq("id", input.jobId)
    .eq("client_id", client.id)
    .single();
  if (!job) return { error: "Not found" };
  const checklist = (job.checklist as { id: string; label: string; done: boolean }[]).map(
    (item) => (item.id === input.itemId ? { ...item, done: input.done } : item),
  );
  await supabase.from("jobs").update({ checklist }).eq("id", input.jobId);
  revalidatePath("/jobs");
  return { ok: true };
}
