import { createAdminClient } from "@/lib/supabase/admin";
import { resolveClient } from "@/lib/crm/resolve-client";
import { leadIngestSchema } from "@/lib/validation/leads";
import { json, options } from "@/lib/http/cors";
import { ingestLead } from "@/lib/leads/ingest";

export function OPTIONS() {
  return options();
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid request" }, 400);
  }

  const parsed = leadIngestSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: "Invalid payload", details: parsed.error.flatten() }, 400);
  }

  const input = parsed.data;
  if (!input.site_key && !input.client_id && !input.domain && !input.business_name) {
    return json({ error: "Missing site_key, domain, or business_name" }, 400);
  }

  // No Turnstile here: this endpoint is called from clients' own websites
  // and from n8n, where Sitewyre's Turnstile widget can't run (it only
  // works on hostnames registered with Cloudflare). A turnstile_token in
  // the body is accepted and ignored. Turnstile protects the forms the
  // portal hosts itself (see src/lib/security/turnstile.ts).

  try {
    const supabase = createAdminClient();
    const client = await resolveClient(supabase, input);
    if (!client) return json({ error: "Unknown client" }, 400);

    const result = await ingestLead(supabase, client, {
      name: input.name,
      phone: input.phone,
      email: input.email || null,
      message: input.message,
      source: input.source ?? "website_form",
      service: input.service ?? null,
      smsOptIn: input.sms_opt_in ?? true,
      consentShown: input.sms_opt_in === true,
    });
    if ("error" in result) return json({ error: result.error }, 500);

    return json({ ok: true, lead_id: result.leadId, contact_id: result.contactId });
  } catch (error) {
    console.error("Failed to store lead", error);
    return json({ error: "Unable to save lead" }, 500);
  }
}
