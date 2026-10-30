"use server";

import { revalidatePath } from "next/cache";
import { requireMembership } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSmsProvider } from "@/lib/adapters";
import { inngest } from "@/lib/inngest/client";
import { nextSendableAt } from "@/lib/scheduling/quiet-hours";
import {
  expandRecurrence,
  parseRecurrenceRule,
} from "@/lib/scheduling/recurrence";
import { hasFeature } from "@/lib/features";
import { normalizePhone } from "@/lib/utils";

const DEFAULT_CHECKLIST = [
  { id: "1", label: "Arrive on site", done: false },
  { id: "2", label: "Complete work", done: false },
  { id: "3", label: "Collect photos", done: false },
];

async function contactPhoneForJob(
  supabase: Awaited<ReturnType<typeof requireMembership>>["supabase"],
  jobId: string,
  clientId: string,
): Promise<string | null> {
  const { data: job } = await supabase
    .from("jobs")
    .select("contact_id")
    .eq("id", jobId)
    .eq("client_id", clientId)
    .maybeSingle();
  if (!job?.contact_id) return null;
  const { data: contact } = await supabase
    .from("contacts")
    .select("phones")
    .eq("id", job.contact_id)
    .maybeSingle();
  const phone = contact?.phones?.[0];
  return phone ? normalizePhone(phone) : null;
}

export async function createJob(formData: FormData) {
  const { supabase, client, user } = await requireMembership();
  if (!client) return { error: "No client" };
  const address = String(formData.get("address") ?? "").trim();
  const start = String(formData.get("scheduled_start") ?? "");
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const recurrence = parseRecurrenceRule(
    String(formData.get("recurrence_rule") ?? ""),
  );
  if (recurrence) {
    const allowed = await hasFeature(
      supabase,
      client.plan ?? "contractor_299",
      "recurring_jobs",
    );
    if (!allowed) {
      return { error: "Recurring jobs are not on your plan" };
    }
  }
  const startDate = start ? new Date(start) : null;
  if (start && Number.isNaN(startDate!.getTime())) {
    return { error: "Invalid start time" };
  }

  const base = {
    client_id: client.id,
    address: address || null,
    notes,
    status: "scheduled",
    assignee_ids: [user.id],
    checklist: DEFAULT_CHECKLIST,
    recurrence_rule: recurrence,
  };

  if (!startDate) {
    const { error } = await supabase.from("jobs").insert({
      ...base,
      scheduled_start: null,
    });
    if (error) return { error: error.message };
  } else {
    const starts = recurrence
      ? expandRecurrence({ start: startDate, rule: recurrence, horizonDays: 90 })
      : [startDate];
    const rows = starts.map((s) => ({
      ...base,
      scheduled_start: s.toISOString(),
      scheduled_end: new Date(s.getTime() + 60 * 60_000).toISOString(),
    }));
    const { error } = await supabase.from("jobs").insert(rows);
    if (error) return { error: error.message };
  }

  revalidatePath("/jobs");
  revalidatePath("/crew");
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

  const phone =
    (input.contactPhone ? normalizePhone(input.contactPhone) : null) ||
    (await contactPhoneForJob(supabase, input.jobId, client.id));

  const timeZone = client.timezone ?? "America/Chicago";

  if (input.status === "en_route" && phone && client.twilio_phone_number) {
    const sendAt = nextSendableAt(new Date(), timeZone);
    if (sendAt.getTime() <= Date.now() + 5_000) {
      await getSmsProvider().send({
        to: phone,
        from: client.twilio_phone_number,
        body: `${client.business_name}: we're on the way.`,
      });
    } else {
      await inngest
        .send({
          name: "portal/appointment.reminder",
          data: {
            to: phone,
            from: client.twilio_phone_number,
            body: `${client.business_name}: we're on the way.`,
            clientId: client.id,
            trigger: "on_my_way",
          },
          ts: sendAt.getTime(),
        })
        .catch(() => undefined);
    }
    await supabase.from("workflow_runs").insert({
      client_id: client.id,
      trigger: "on_my_way",
      status: "sent",
      log: { jobId: input.jobId, deferred: sendAt.getTime() > Date.now() + 5_000 },
    });
  }

  if (input.status === "complete") {
    const reviewBody =
      `Thanks for choosing ${client.business_name}! Mind leaving a quick review? ${client.google_review_url ?? ""}`.trim();
    if (phone && client.twilio_phone_number) {
      const sendAt = nextSendableAt(new Date(), timeZone);
      await inngest
        .send({
          name: "portal/appointment.reminder",
          data: {
            to: phone,
            from: client.twilio_phone_number,
            body: reviewBody,
            clientId: client.id,
            trigger: "review_request",
          },
          ...(sendAt.getTime() > Date.now() + 5_000
            ? { ts: sendAt.getTime() }
            : {}),
        })
        .catch(() => undefined);
    }
    await supabase.from("workflow_runs").insert({
      client_id: client.id,
      trigger: "review_request",
      status: phone ? "sent" : "skipped",
      log: { jobId: input.jobId, phone: phone ?? null },
    });

    await inngest
      .send({
        name: "portal/job.completed",
        data: { jobId: input.jobId, clientId: client.id },
      })
      .catch(() => undefined);
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
  const checklist = (
    job.checklist as { id: string; label: string; done: boolean }[]
  ).map((item) =>
    item.id === input.itemId ? { ...item, done: input.done } : item,
  );
  await supabase.from("jobs").update({ checklist }).eq("id", input.jobId);
  revalidatePath("/jobs");
  revalidatePath("/crew");
  return { ok: true };
}

export async function updateJobNotes(input: { jobId: string; notes: string }) {
  const { supabase, client } = await requireMembership();
  if (!client) return { error: "No client" };
  const { error } = await supabase
    .from("jobs")
    .update({
      notes: input.notes.trim() || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.jobId)
    .eq("client_id", client.id);
  if (error) return { error: error.message };
  revalidatePath("/jobs");
  revalidatePath("/crew");
  return { ok: true };
}

export async function addJobPhoto(formData: FormData) {
  const { supabase, client } = await requireMembership();
  if (!client) return { error: "No client" };

  const jobId = String(formData.get("jobId") ?? "");
  const file = formData.get("photo");
  if (!jobId || !(file instanceof File) || file.size === 0) {
    return { error: "Photo required" };
  }
  if (file.size > 8 * 1024 * 1024) {
    return { error: "Photo must be under 8MB" };
  }

  const { data: job } = await supabase
    .from("jobs")
    .select("id, photos")
    .eq("id", jobId)
    .eq("client_id", client.id)
    .maybeSingle();
  if (!job) return { error: "Job not found" };

  const ext =
    file.type === "image/png"
      ? "png"
      : file.type === "image/webp"
        ? "webp"
        : "jpg";
  const path = `${client.id}/${jobId}/${Date.now()}.${ext}`;
  const admin = createAdminClient();
  const buffer = Buffer.from(await file.arrayBuffer());
  const { error: uploadError } = await admin.storage
    .from("job-photos")
    .upload(path, buffer, {
      contentType: file.type || "image/jpeg",
      upsert: false,
    });
  if (uploadError) {
    return {
      error: `Upload failed (${uploadError.message}). Apply migration 0004_job_photos_storage.sql if the bucket is missing.`,
    };
  }

  const { data: pub } = admin.storage.from("job-photos").getPublicUrl(path);
  const photos = [...((job.photos as string[]) ?? []), pub.publicUrl];
  const { error } = await supabase
    .from("jobs")
    .update({ photos, updated_at: new Date().toISOString() })
    .eq("id", jobId)
    .eq("client_id", client.id);
  if (error) return { error: error.message };

  revalidatePath("/jobs");
  revalidatePath("/crew");
  return { ok: true, url: pub.publicUrl };
}
