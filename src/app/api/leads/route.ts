import { createAdminClient } from "@/lib/supabase/admin";
import { findOrCreateContact } from "@/lib/crm/contacts";
import { resolveClient } from "@/lib/crm/resolve-client";
import { leadIngestSchema } from "@/lib/validation/leads";
import { json, options } from "@/lib/http/cors";
import { inngest } from "@/lib/inngest/client";
import { verifyTurnstileToken } from "@/lib/security/turnstile";
import { normalizePhone } from "@/lib/utils";

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

  const turnstile = await verifyTurnstileToken(
    input.turnstile_token,
    request.headers.get("cf-connecting-ip") ??
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim(),
  );
  if (!turnstile.ok) {
    return json({ error: turnstile.error ?? "Turnstile failed" }, 403);
  }

  try {
    const supabase = createAdminClient();
    const client = await resolveClient(supabase, input);
    if (!client) return json({ error: "Unknown client" }, 400);

    const contact = await findOrCreateContact(supabase, {
      clientId: client.id,
      name: input.name,
      phone: input.phone,
      email: input.email || null,
      source: input.source ?? "website_form",
      smsOptIn: input.sms_opt_in ?? true,
    });

    let stageId: string | null = null;
    const { data: newStage } = await supabase
      .from("pipeline_stages")
      .select("id")
      .eq("client_id", client.id)
      .eq("name", "New")
      .maybeSingle();
    stageId = newStage?.id ?? null;

    const { data: lead, error } = await supabase
      .from("leads")
      .insert({
        client_id: client.id,
        contact_id: contact.id,
        stage_id: stageId,
        name: input.name,
        phone: normalizePhone(input.phone) || input.phone,
        email: input.email || null,
        message: input.message,
        source: input.source ?? "website_form",
        service: input.service ?? null,
        last_activity_at: new Date().toISOString(),
      })
      .select("*")
      .single();

    if (error) {
      console.error("Failed to store lead", error);
      return json({ error: "Unable to save lead" }, 500);
    }

    await supabase.from("activities").insert({
      client_id: client.id,
      contact_id: contact.id,
      type: "lead_created",
      payload: { lead_id: lead.id, source: lead.source, message: lead.message },
      occurred_at: new Date().toISOString(),
    });

    try {
      await inngest.send({
        name: "portal/lead.created",
        data: {
          clientId: client.id,
          leadId: lead.id,
          phone: lead.phone,
          email: lead.email,
          name: lead.name,
        },
      });
    } catch (err) {
      // Lead is already stored; automations can retry once INNGEST_EVENT_KEY is set.
      console.warn("Inngest lead.created not sent", err);
    }

    return json({ ok: true, lead_id: lead.id, contact_id: contact.id });
  } catch (error) {
    console.error("Failed to store lead", error);
    return json({ error: "Unable to save lead" }, 500);
  }
}
