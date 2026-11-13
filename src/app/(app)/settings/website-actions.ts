"use server";

import { revalidatePath } from "next/cache";
import { requireMembership } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeHost } from "@/lib/utils";

type Result = { ok: true } | { error: string };

function canEdit(role: string): boolean {
  return role === "owner" || role === "sitewyre_admin";
}

const HOST = /^(?=.{4,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/;

/**
 * The address of the client's own website. The chat bubble, form capture
 * and the "connected" check only work from this address, so it must not
 * already belong to another business.
 */
export async function setWebsiteDomain(formData: FormData): Promise<Result> {
  const { supabase, client, role } = await requireMembership();
  if (!client) return { error: "No business is linked to this account." };
  if (!canEdit(role)) return { error: "Only the owner or a Sitewyre admin can change this." };

  const domain = normalizeHost(String(formData.get("domain") ?? ""));
  if (!domain || !HOST.test(domain)) {
    return { error: "Enter your website address, like yourbusiness.com." };
  }

  // Other businesses aren't visible to this user, so check with the
  // service role.
  const { data: taken } = await createAdminClient()
    .from("clients")
    .select("id")
    .eq("domain", domain)
    .neq("id", client.id)
    .limit(1);
  if (taken?.length) {
    return {
      error: "That website is already connected to another Sitewyre account. Contact Sitewyre support if it's yours.",
    };
  }

  const { error } = await supabase.from("clients").update({ domain }).eq("id", client.id);
  if (error) return { error: error.message };

  revalidatePath("/settings");
  return { ok: true };
}

/** "Capture my website's forms." Needs the website address first, because
 * captured forms are only accepted from that address. */
export async function setFormCapture(formData: FormData): Promise<Result> {
  const { supabase, client, role } = await requireMembership();
  if (!client) return { error: "No business is linked to this account." };
  if (!canEdit(role)) return { error: "Only the owner or a Sitewyre admin can change this." };

  const enabled = formData.get("enabled") === "true";
  if (enabled && !client.domain && !client.live_site_url) {
    return { error: "Save your website address first." };
  }

  const { error } = await supabase
    .from("clients")
    .update({ form_capture_enabled: enabled })
    .eq("id", client.id);
  if (error) return { error: error.message };

  revalidatePath("/settings");
  return { ok: true };
}

/**
 * The client confirms the SMS consent wording is under every form on
 * their website and in their privacy policy. Leads captured from their
 * forms are only texted while this is confirmed. Recorded in the audit
 * log with who confirmed it.
 */
export async function setWebsiteConsentConfirmed(formData: FormData): Promise<Result> {
  const { supabase, client, role, user } = await requireMembership();
  if (!client) return { error: "No business is linked to this account." };
  if (!canEdit(role)) return { error: "Only the owner or a Sitewyre admin can change this." };

  const confirmed = formData.get("confirmed") === "true";
  const { error } = await supabase
    .from("clients")
    .update({ website_consent_confirmed_at: confirmed ? new Date().toISOString() : null })
    .eq("id", client.id);
  if (error) return { error: error.message };

  await supabase.from("audit_log").insert({
    actor_id: user.id,
    action: confirmed ? "website_sms_consent_confirmed" : "website_sms_consent_withdrawn",
    entity: "client",
    entity_id: client.id,
    client_id: client.id,
    diff: { confirmed },
  });

  revalidatePath("/settings");
  return { ok: true };
}
