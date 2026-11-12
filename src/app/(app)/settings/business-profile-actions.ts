"use server";

import { revalidatePath } from "next/cache";
import { requireMembership } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeHost, normalizePhone } from "@/lib/utils";
import { businessProfileSchema } from "@/lib/business-profile/validate";
import type { ClientRow } from "@/lib/supabase/types";

const LOGO_BUCKET = "business-logos";
const MAX_LOGO_BYTES = 2.5 * 1024 * 1024;
const ALLOWED_LOGO_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
};

function canEditBusinessProfile(role: string): boolean {
  return role === "owner" || role === "sitewyre_admin";
}

function logoPathFromPublicUrl(url: string): string | null {
  const marker = `/object/public/${LOGO_BUCKET}/`;
  const i = url.indexOf(marker);
  return i === -1 ? null : url.slice(i + marker.length);
}

export async function updateBusinessProfile(
  formData: FormData,
): Promise<{ ok: true } | { error: string }> {
  const { supabase, client, role } = await requireMembership();
  if (!client) return { error: "No business is linked to this account." };
  if (!canEditBusinessProfile(role)) {
    return { error: "Only the owner or a Sitewyre admin can edit the business profile." };
  }

  const raw = {
    business_name: String(formData.get("business_name") ?? ""),
    legal_business_name: String(formData.get("legal_business_name") ?? ""),
    owner_name: String(formData.get("owner_name") ?? ""),
    business_email: String(formData.get("business_email") ?? ""),
    phone: String(formData.get("phone") ?? ""),
    website: String(formData.get("website") ?? ""),
    domain: String(formData.get("domain") ?? ""),
    trade: String(formData.get("trade") ?? ""),
    address_line1: String(formData.get("address_line1") ?? ""),
    city: String(formData.get("city") ?? ""),
    state: String(formData.get("state") ?? ""),
    postal_code: String(formData.get("postal_code") ?? ""),
    country: String(formData.get("country") ?? ""),
    timezone: String(formData.get("timezone") ?? ""),
  };

  const parsed = businessProfileSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the form for errors." };
  }
  const v = parsed.data;

  const website = v.website
    ? v.website.includes("://")
      ? v.website
      : `https://${v.website}`
    : null;

  const update: Partial<ClientRow> = {
    business_name: v.business_name || null,
    legal_business_name: v.legal_business_name || null,
    owner_name: v.owner_name || null,
    business_email: v.business_email || null,
    phone: v.phone ? normalizePhone(v.phone) : client.phone,
    website,
    trade: v.trade || null,
    address_line1: v.address_line1 || null,
    city: v.city || null,
    state: v.state || null,
    postal_code: v.postal_code || null,
    country: v.country || "US",
    timezone: v.timezone || "America/Chicago",
    updated_at: new Date().toISOString(),
  };

  // Domain drives inbound lead attribution (resolveClient()) — editable by
  // a Sitewyre admin only, regardless of what a tampered client submits.
  if (role === "sitewyre_admin" && v.domain) {
    update.domain = normalizeHost(v.domain);
  }

  const { error } = await supabase.from("clients").update(update).eq("id", client.id);
  if (error) return { error: error.message };

  revalidatePath("/settings");
  revalidatePath("/");
  return { ok: true };
}

export async function uploadBusinessLogo(
  formData: FormData,
): Promise<{ ok: true; logoUrl: string } | { error: string }> {
  const { supabase, client, role } = await requireMembership();
  if (!client) return { error: "No business is linked to this account." };
  if (!canEditBusinessProfile(role)) {
    return { error: "Only the owner or a Sitewyre admin can edit the business profile." };
  }

  const file = formData.get("logo");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose a logo file" };
  }
  if (file.size > MAX_LOGO_BYTES) {
    return { error: "Logo must be under 2.5MB" };
  }
  const ext = ALLOWED_LOGO_TYPES[file.type];
  if (!ext) {
    return { error: "Logo must be a PNG or JPG" };
  }

  const admin = createAdminClient();
  const path = `${client.id}/logo-${Date.now()}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  const { error: uploadError } = await admin.storage
    .from(LOGO_BUCKET)
    .upload(path, buffer, { contentType: file.type, upsert: false });
  if (uploadError) {
    return {
      error: `Upload failed (${uploadError.message}). Apply migration 0013_business_profile.sql if the bucket is missing.`,
    };
  }

  const previousPath = client.logo_url ? logoPathFromPublicUrl(client.logo_url) : null;
  const { data: pub } = admin.storage.from(LOGO_BUCKET).getPublicUrl(path);

  const { error } = await supabase
    .from("clients")
    .update({ logo_url: pub.publicUrl, updated_at: new Date().toISOString() })
    .eq("id", client.id);
  if (error) return { error: error.message };

  if (previousPath) {
    await admin.storage.from(LOGO_BUCKET).remove([previousPath]).catch(() => undefined);
  }

  revalidatePath("/settings");
  revalidatePath("/");
  return { ok: true, logoUrl: pub.publicUrl };
}

export async function removeBusinessLogo(): Promise<{ ok: true } | { error: string }> {
  const { supabase, client, role } = await requireMembership();
  if (!client) return { error: "No business is linked to this account." };
  if (!canEditBusinessProfile(role)) {
    return { error: "Only the owner or a Sitewyre admin can edit the business profile." };
  }

  const path = client.logo_url ? logoPathFromPublicUrl(client.logo_url) : null;

  const { error } = await supabase
    .from("clients")
    .update({ logo_url: null, updated_at: new Date().toISOString() })
    .eq("id", client.id);
  if (error) return { error: error.message };

  if (path) {
    const admin = createAdminClient();
    await admin.storage.from(LOGO_BUCKET).remove([path]).catch(() => undefined);
  }

  revalidatePath("/settings");
  revalidatePath("/");
  return { ok: true };
}
