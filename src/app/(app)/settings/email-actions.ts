"use server";

import { revalidatePath } from "next/cache";
import { requireMembership } from "@/lib/auth/session";
import { normalizeHost } from "@/lib/utils";
import { isValidDomain } from "@/lib/business-profile/validate";
import { createEmailDomain, refreshEmailDomain } from "@/lib/email/resend-domains";

function canEditPhoneEmail(role: string): boolean {
  return role === "owner" || role === "sitewyre_admin";
}

export async function createClientEmailDomain(
  formData: FormData,
): Promise<{ ok: true } | { error: string }> {
  const { supabase, client, role } = await requireMembership();
  if (!client) return { error: "No business is linked to this account." };
  if (!canEditPhoneEmail(role)) {
    return { error: "Only the owner or a Sitewyre admin can set up email." };
  }
  if (client.email_domain) {
    return { error: "A sending domain is already set up — remove it first to change it." };
  }

  const raw = String(formData.get("domain") ?? "").trim();
  if (!raw || !isValidDomain(raw)) return { error: "Enter a valid domain" };
  const domain = normalizeHost(raw);

  let created;
  try {
    created = await createEmailDomain(domain);
  } catch (err) {
    return { error: (err as Error).message };
  }

  const { error } = await supabase
    .from("clients")
    .update({
      email_domain: domain,
      email_domain_resend_id: created.id,
      email_domain_status: created.status,
      email_dns_records: created.records,
    })
    .eq("id", client.id);
  if (error) return { error: error.message };

  revalidatePath("/settings");
  return { ok: true };
}

export async function verifyClientEmailDomain(): Promise<
  | { ok: true; status: string; records: Awaited<ReturnType<typeof refreshEmailDomain>>["records"] }
  | { error: string }
> {
  const { supabase, client, role } = await requireMembership();
  if (!client) return { error: "No business is linked to this account." };
  if (!canEditPhoneEmail(role)) {
    return { error: "Only the owner or a Sitewyre admin can set up email." };
  }
  if (!client.email_domain_resend_id || !client.email_domain) {
    return { error: "No sending domain set up yet." };
  }

  let refreshed;
  try {
    refreshed = await refreshEmailDomain(client.email_domain_resend_id, client.email_domain);
  } catch (err) {
    return { error: (err as Error).message };
  }

  const { error } = await supabase
    .from("clients")
    .update({ email_domain_status: refreshed.status, email_dns_records: refreshed.records })
    .eq("id", client.id);
  if (error) return { error: error.message };

  revalidatePath("/settings");
  return { ok: true, status: refreshed.status, records: refreshed.records };
}

export async function updateEmailSenderSettings(
  formData: FormData,
): Promise<{ ok: true } | { error: string }> {
  const { supabase, client, role } = await requireMembership();
  if (!client) return { error: "No business is linked to this account." };
  if (!canEditPhoneEmail(role)) {
    return { error: "Only the owner or a Sitewyre admin can set up email." };
  }

  const fromName = String(formData.get("email_from_name") ?? "").trim();
  const replyTo = String(formData.get("email_reply_to") ?? "").trim();
  if (replyTo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(replyTo)) {
    return { error: "Enter a valid reply-to email" };
  }

  const { error } = await supabase
    .from("clients")
    .update({
      email_from_name: fromName || null,
      email_reply_to: replyTo || null,
    })
    .eq("id", client.id);
  if (error) return { error: error.message };

  revalidatePath("/settings");
  return { ok: true };
}
