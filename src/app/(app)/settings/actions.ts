"use server";

import { revalidatePath } from "next/cache";
import { requireMembership } from "@/lib/auth/session";
import { applyTradePreset } from "@/lib/crm/apply-trade-preset";
import { ensureDefaultAvailability } from "@/lib/scheduling/availability";

export async function updateSettings(formData: FormData): Promise<void> {
  const { supabase, client, role } = await requireMembership();
  if (!client) return;
  if (!["owner", "office", "sitewyre_admin"].includes(role)) return;

  const googleReviewUrl = String(formData.get("google_review_url") ?? "").trim();
  const timezone = String(formData.get("timezone") ?? "America/Chicago");
  const phone = String(formData.get("phone") ?? "").trim();
  const serviceArea = String(formData.get("service_area") ?? "").trim();

  const checklist = {
    ...((client.setup_checklist as Record<string, boolean> | null) ?? {}),
    google_review: Boolean(googleReviewUrl),
    verify_phone: Boolean(phone || client.twilio_phone_number),
  };

  await supabase
    .from("clients")
    .update({
      google_review_url: googleReviewUrl || null,
      timezone,
      phone: phone || client.phone,
      service_area: serviceArea || null,
      setup_checklist: checklist,
      updated_at: new Date().toISOString(),
    })
    .eq("id", client.id);

  revalidatePath("/settings");
  revalidatePath("/");
}

export async function inviteCrew(formData: FormData) {
  const { client, role } = await requireMembership();
  if (!client || (role !== "owner" && role !== "sitewyre_admin")) {
    return { error: "Owners only" };
  }
  const phone = String(formData.get("phone") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  if (!phone && !email) return { error: "Phone or email required" };

  const { createAdminClient } = await import("@/lib/supabase/admin");
  const admin = createAdminClient();
  const { data: user, error } = await admin.auth.admin.createUser({
    email: email || undefined,
    phone: phone || undefined,
    email_confirm: true,
    phone_confirm: Boolean(phone),
  });

  if (error || !user.user) {
    return { error: error?.message ?? "Unable to invite crew" };
  }

  await admin.from("memberships").upsert({
    user_id: user.user.id,
    client_id: client.id,
    role: "crew",
  });

  const checklist = {
    ...((client.setup_checklist as Record<string, boolean> | null) ?? {}),
    invite_crew: true,
  };
  await admin
    .from("clients")
    .update({ setup_checklist: checklist })
    .eq("id", client.id);

  revalidatePath("/settings");
  return { ok: true };
}

export async function reseedTradePreset(): Promise<void> {
  const { supabase, client } = await requireMembership();
  if (!client) return;
  await applyTradePreset(supabase, client.id, client.trade ?? "other");
  const checklist = {
    ...((client.setup_checklist as Record<string, boolean> | null) ?? {}),
    add_services: true,
  };
  await supabase
    .from("clients")
    .update({ setup_checklist: checklist })
    .eq("id", client.id);
  revalidatePath("/settings");
  revalidatePath("/leads");
}

export async function seedAvailabilityIfNeeded() {
  const { supabase, client, user } = await requireMembership();
  if (!client) return { error: "No client" };
  const ownerId = client.user_id ?? user.id;
  await ensureDefaultAvailability(supabase, client.id, ownerId);
  revalidatePath("/settings");
  revalidatePath("/calendar");
  return { ok: true };
}

export async function upsertAvailability(formData: FormData): Promise<void> {
  const { supabase, client, user, role } = await requireMembership();
  if (!client) return;
  if (!["owner", "office", "sitewyre_admin"].includes(role)) return;

  const id = String(formData.get("id") ?? "").trim();
  const weekday = Number(formData.get("weekday"));
  const startTime = String(formData.get("start_time") ?? "").trim();
  const endTime = String(formData.get("end_time") ?? "").trim();
  const bufferMinutes = Number(formData.get("buffer_minutes") ?? 15);
  const minNoticeHours = Number(formData.get("min_notice_hours") ?? 2);

  if (
    Number.isNaN(weekday) ||
    weekday < 0 ||
    weekday > 6 ||
    !startTime ||
    !endTime
  ) {
    return;
  }

  const ownerId = client.user_id ?? user.id;
  const payload = {
    client_id: client.id,
    user_id: ownerId,
    weekday,
    start_time: startTime.length === 5 ? `${startTime}:00` : startTime,
    end_time: endTime.length === 5 ? `${endTime}:00` : endTime,
    buffer_minutes: Number.isFinite(bufferMinutes) ? bufferMinutes : 15,
    min_notice_hours: Number.isFinite(minNoticeHours) ? minNoticeHours : 2,
  };

  if (id) {
    await supabase
      .from("availability")
      .update(payload)
      .eq("id", id)
      .eq("client_id", client.id);
  } else {
    await supabase.from("availability").insert(payload);
  }

  revalidatePath("/settings");
  revalidatePath("/calendar");
}

export async function deleteAvailability(formData: FormData): Promise<void> {
  const { supabase, client, role } = await requireMembership();
  if (!client) return;
  if (!["owner", "office", "sitewyre_admin"].includes(role)) return;
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await supabase
    .from("availability")
    .delete()
    .eq("id", id)
    .eq("client_id", client.id);
  revalidatePath("/settings");
  revalidatePath("/calendar");
}

export async function toggleServiceBookable(formData: FormData): Promise<void> {
  const { supabase, client, role } = await requireMembership();
  if (!client) return;
  if (!["owner", "office", "sitewyre_admin"].includes(role)) return;
  const id = String(formData.get("id") ?? "");
  const bookable = String(formData.get("bookable_online") ?? "") === "true";
  if (!id) return;
  await supabase
    .from("services")
    .update({ bookable_online: bookable })
    .eq("id", id)
    .eq("client_id", client.id);
  const checklist = {
    ...((client.setup_checklist as Record<string, boolean> | null) ?? {}),
    add_services: true,
  };
  await supabase
    .from("clients")
    .update({ setup_checklist: checklist })
    .eq("id", client.id);
  revalidatePath("/settings");
}
