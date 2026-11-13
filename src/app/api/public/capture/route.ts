import { createAdminClient } from "@/lib/supabase/admin";
import { json, options } from "@/lib/http/cors";
import { ingestLead } from "@/lib/leads/ingest";
import { clientIp, hashIp, isAllowedChatOrigin } from "@/lib/chat-widget/limits";
import {
  CAPTURE_MAX_PER_CLIENT_PER_DAY,
  CAPTURE_MAX_PER_IP_PER_HOUR,
  captureSchema,
  captureTiming,
  findDuplicateLead,
  toCapturedLead,
} from "@/lib/website/capture";

// Waits a few seconds before saving (see captureTiming).
export const maxDuration = 30;

export function OPTIONS() {
  return options();
}

/**
 * A copy of a form submission from a client's own website, sent by the
 * Sitewyre script. Creates the lead and starts its workflow, exactly like
 * a lead from a Sitewyre-built site.
 *
 * Only works when the client has turned form capture on, and only from
 * the client's own website. A captured lead is only texted if the client
 * has confirmed the SMS consent wording is shown on their forms.
 *
 * The body is read as text: the script sends it as text/plain so the
 * browser needs no pre-flight request and the copy survives the page
 * changing as the form submits.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = JSON.parse(await request.text());
  } catch {
    return json({ error: "Invalid request" }, 400);
  }
  const parsed = captureSchema.safeParse(body);
  if (!parsed.success) return json({ error: "Invalid request" }, 400);
  const input = parsed.data;

  const supabase = createAdminClient();
  const { data: client } = await supabase
    .from("clients")
    .select("*")
    .eq("site_key", input.site_key)
    .maybeSingle();
  if (!client?.form_capture_enabled) return json({ ok: false, reason: "capture_off" });
  if (!isAllowedChatOrigin(request.headers.get("origin"), client)) {
    return json({ error: "Not available on this site." }, 403);
  }

  const lead = toCapturedLead(input);
  if (!lead) return json({ ok: false, reason: "not_a_lead" });

  const ip = clientIp(request);
  const ipHash = ip ? hashIp(ip) : null;
  if (ipHash) {
    const { count } = await supabase
      .from("website_form_captures")
      .select("*", { count: "exact", head: true })
      .eq("ip_hash", ipHash)
      .gte("created_at", new Date(Date.now() - 3_600_000).toISOString());
    if ((count ?? 0) >= CAPTURE_MAX_PER_IP_PER_HOUR) return json({ error: "Too many requests" }, 429);
  }
  const { count: today } = await supabase
    .from("website_form_captures")
    .select("*", { count: "exact", head: true })
    .eq("client_id", client.id)
    .gte("created_at", new Date(Date.now() - 86_400_000).toISOString());
  if ((today ?? 0) >= CAPTURE_MAX_PER_CLIENT_PER_DAY) return json({ error: "Too many requests" }, 429);

  if (captureTiming.settleMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, captureTiming.settleMs));
  }

  const smsConsent = !!client.website_consent_confirmed_at;
  const consentText = input.consent_text?.trim() || null;
  const record = {
    client_id: client.id,
    page_url: input.page_url?.slice(0, 500) ?? null,
    form_label: input.form_label?.slice(0, 120) ?? null,
    ip_hash: ipHash,
    consent_found: !!consentText,
    consent_text: consentText?.slice(0, 600) ?? null,
    sms_consent: smsConsent,
  };

  const duplicate = await findDuplicateLead(supabase, client.id, lead, new Date());
  if (duplicate) {
    await supabase
      .from("website_form_captures")
      .insert({ ...record, lead_id: duplicate.id, outcome: "duplicate" });
    return json({ ok: true, duplicate: true });
  }

  const result = await ingestLead(supabase, client, {
    name: lead.name,
    phone: lead.phone,
    email: lead.email,
    message: lead.message,
    source: "website_form",
    // No texts unless the client has confirmed their forms show the SMS
    // consent wording. The lead, the owner alert and the email reply
    // happen either way.
    smsOptIn: smsConsent,
    consentShown: smsConsent,
  });
  if ("error" in result) return json({ error: result.error }, 500);

  await supabase
    .from("website_form_captures")
    .insert({ ...record, lead_id: result.leadId, outcome: "created" });

  return json({ ok: true });
}
