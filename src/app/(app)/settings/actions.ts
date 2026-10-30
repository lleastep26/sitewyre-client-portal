"use server";

import { revalidatePath } from "next/cache";
import { requireMembership } from "@/lib/auth/session";
import { applyTradePreset } from "@/lib/crm/apply-trade-preset";

export async function updateSettings(formData: FormData) {
  const { supabase, client, role } = await requireMembership();
  if (!client) return { error: "No client" };
  if (!["owner", "office", "sitewyre_admin"].includes(role)) {
    return { error: "Not allowed" };
  }

  const googleReviewUrl = String(formData.get("google_review_url") ?? "").trim();
  const timezone = String(formData.get("timezone") ?? "America/Chicago");
  const phone = String(formData.get("phone") ?? "").trim();
  const serviceArea = String(formData.get("service_area") ?? "").trim();

  const checklist = {
    ...((client.setup_checklist as Record<string, boolean> | null) ?? {}),
    google_review: Boolean(googleReviewUrl),
    verify_phone: Boolean(phone || client.twilio_phone_number),
  };

  const { error } = await supabase
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

  if (error) return { error: error.message };
  revalidatePath("/settings");
  revalidatePath("/");
  return { ok: true };
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

export async function reseedTradePreset() {
  const { supabase, client } = await requireMembership();
  if (!client) return { error: "No client" };
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
  return { ok: true };
}
