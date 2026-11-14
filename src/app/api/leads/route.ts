import { createAdminClient } from "@/lib/supabase/admin";
import { resolveClient } from "@/lib/crm/resolve-client";
import { leadIngestSchema } from "@/lib/validation/leads";
import { json, options } from "@/lib/http/cors";
import { ingestLead } from "@/lib/leads/ingest";
import { classifyLeadCaller } from "@/lib/leads/api-guard";
import { clientIp, hashIp, isAllowedChatOrigin } from "@/lib/chat-widget/limits";
import {
  CAPTURE_MAX_PER_CLIENT_PER_DAY,
  CAPTURE_MAX_PER_IP_PER_HOUR,
} from "@/lib/website/capture";

export function OPTIONS() {
  return options();
}

/**
 * Stores a lead and starts its workflow. Called two ways (see
 * src/lib/leads/api-guard.ts):
 *
 * - by n8n, from a server, with the shared secret header;
 * - by a client's own website, from the visitor's browser. Those requests
 *   must come from the client's saved website, are limited per visitor
 *   and per client (the same limits as form capture), and carry a hidden
 *   trap field.
 *
 * No Turnstile: Sitewyre's Turnstile widget can't run on other people's
 * websites. A turnstile_token in the body is accepted and ignored.
 */
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

  const caller = classifyLeadCaller(request);
  if (caller.kind === "rejected") return json({ error: caller.error }, caller.status);

  try {
    const supabase = createAdminClient();
    const client = await resolveClient(supabase, input);
    if (!client) return json({ error: "Unknown client" }, 400);

    let ipHash: string | null = null;
    if (caller.kind === "browser") {
      if (!isAllowedChatOrigin(caller.origin, client)) {
        return json({ error: "Leads for this business aren't accepted from this website." }, 403);
      }

      // A hidden field real visitors never fill in. Answered like a
      // success, so a bot learns nothing.
      if (input.website?.trim()) return json({ ok: true });

      const ip = clientIp(request);
      ipHash = ip ? hashIp(ip) : null;
      if (ipHash) {
        const { count } = await supabase
          .from("website_form_captures")
          .select("*", { count: "exact", head: true })
          .eq("ip_hash", ipHash)
          .gte("created_at", new Date(Date.now() - 3_600_000).toISOString());
        if ((count ?? 0) >= CAPTURE_MAX_PER_IP_PER_HOUR) {
          return json({ error: "Too many requests" }, 429);
        }
      }
      const { count: today } = await supabase
        .from("website_form_captures")
        .select("*", { count: "exact", head: true })
        .eq("client_id", client.id)
        .gte("created_at", new Date(Date.now() - 86_400_000).toISOString());
      if ((today ?? 0) >= CAPTURE_MAX_PER_CLIENT_PER_DAY) {
        return json({ error: "Too many requests" }, 429);
      }
    }

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

    // Browser posts are counted in the same table as captured forms, so
    // one visitor's limit covers both.
    if (caller.kind === "browser") {
      await supabase.from("website_form_captures").insert({
        client_id: client.id,
        lead_id: result.leadId,
        page_url: request.headers.get("referer")?.slice(0, 500) ?? null,
        form_label: "direct-post",
        ip_hash: ipHash,
        consent_found: !!input.consent_text?.trim(),
        consent_text: input.consent_text?.trim().slice(0, 600) || null,
        sms_consent: input.sms_opt_in ?? true,
        outcome: "created",
      });
    }

    return json({ ok: true, lead_id: result.leadId, contact_id: result.contactId });
  } catch (error) {
    console.error("Failed to store lead", error);
    return json({ error: "Unable to save lead" }, 500);
  }
}
