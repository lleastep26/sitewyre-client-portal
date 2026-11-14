"use server";

import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { ingestLead } from "@/lib/leads/ingest";
import { hashIp } from "@/lib/chat-widget/limits";
import { smsConsentText } from "@/lib/a2p/consent-text";
import { verifyPortalFormTurnstile } from "@/lib/security/turnstile";
import { CAPTURE_MAX_PER_IP_PER_HOUR, toCapturedLead } from "@/lib/website/capture";

/**
 * A submission from the embeddable lead form. The form shows the SMS
 * consent wording itself, so these leads can be texted (subject to the
 * usual A2P and opt-out checks).
 */
export async function submitEmbedLead(
  siteKey: string,
  formData: FormData,
): Promise<{ ok: true } | { error: string }> {
  // A hidden field real visitors never fill in.
  if (String(formData.get("website") ?? "").trim()) return { ok: true };

  const supabase = createAdminClient();
  const { data: client } = await supabase
    .from("clients")
    .select("*")
    .eq("site_key", siteKey)
    .maybeSingle();
  if (!client) return { error: "This form isn't available." };

  const name = String(formData.get("name") ?? "").trim();
  const message = String(formData.get("message") ?? "").trim();
  const lead = toCapturedLead({
    site_key: siteKey,
    name,
    phone: String(formData.get("phone") ?? ""),
    email: String(formData.get("email") ?? ""),
    message,
  });
  if (!name || !lead?.phone || !message) {
    return { error: "Please enter your name, a phone number with area code, and what you need." };
  }

  const requestHeaders = await headers();
  const ip =
    requestHeaders.get("cf-connecting-ip") ??
    requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    null;

  // Bot check, when Turnstile is set up. The form is the portal's own
  // page, even when it's framed on a client's site.
  const botCheck = await verifyPortalFormTurnstile(formData.get("turnstile_token"), ip);
  if (!botCheck.ok) return { error: "Please complete the security check and try again." };
  const ipHash = ip ? hashIp(ip) : null;
  if (ipHash) {
    const { count } = await supabase
      .from("website_form_captures")
      .select("*", { count: "exact", head: true })
      .eq("ip_hash", ipHash)
      .gte("created_at", new Date(Date.now() - 3_600_000).toISOString());
    if ((count ?? 0) >= CAPTURE_MAX_PER_IP_PER_HOUR) {
      return { error: "Too many requests. Please call us instead." };
    }
  }

  const result = await ingestLead(supabase, client, {
    name: lead.name,
    phone: lead.phone,
    email: lead.email,
    message: lead.message,
    source: "website_form",
    smsOptIn: true,
    consentShown: true,
  });
  if ("error" in result) return { error: "Something went wrong. Please try again." };

  await supabase.from("website_form_captures").insert({
    client_id: client.id,
    lead_id: result.leadId,
    page_url: requestHeaders.get("referer")?.slice(0, 500) ?? null,
    form_label: "sitewyre-lead-form",
    ip_hash: ipHash,
    consent_found: true,
    consent_text: smsConsentText(client.business_name),
    sms_consent: true,
    outcome: "created",
  });

  return { ok: true };
}
