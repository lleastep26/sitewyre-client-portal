import { createAdminClient } from "@/lib/supabase/admin";
import { resolveClient } from "@/lib/crm/resolve-client";
import { reviewIngestSchema } from "@/lib/validation/leads";
import { json, options } from "@/lib/http/cors";
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
 * n8n's "Review Submitted workflow" calls this from a server and doesn't
 * send the shared secret yet, so its unsigned calls are still accepted.
 * Set this to true once that n8n node sends X-Leads-Secret; unsigned
 * server calls are then refused whenever LEADS_API_SECRET is set.
 */
const REQUIRE_SECRET_FOR_SERVERS = false;

/**
 * Stores a star rating. Protected like /api/leads (see
 * src/lib/leads/api-guard.ts): a browser post must come from the client's
 * saved website and is limited per visitor and per client, with a hidden
 * trap field; a server call may carry the shared secret.
 *
 * No Turnstile: called from clients' own websites.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid request" }, 400);
  }

  const parsed = reviewIngestSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: "Invalid payload", details: parsed.error.flatten() }, 400);
  }

  const input = parsed.data;
  const caller = classifyLeadCaller(request, process.env, {
    requireSecretForServers: REQUIRE_SECRET_FOR_SERVERS,
  });
  if (caller.kind === "rejected") return json({ error: caller.error }, caller.status);

  try {
    const supabase = createAdminClient();
    const client = await resolveClient(supabase, input);
    if (!client) return json({ error: "Unknown client" }, 400);

    let ipHash: string | null = null;
    if (caller.kind === "browser") {
      if (!isAllowedChatOrigin(caller.origin, client)) {
        return json({ error: "Reviews for this business aren't accepted from this website." }, 403);
      }
      // Answered like a success, so a bot learns nothing.
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

    const routed =
      input.routed_to_google ??
      (input.rating >= 4 && Boolean(client.google_review_url));

    const { data, error } = await supabase
      .from("reviews")
      .insert({
        client_id: client.id,
        rating: input.rating,
        reviewer_name: input.name ?? null,
        reviewer_phone: input.phone ?? null,
        reviewer_email: input.email ?? null,
        feedback: input.feedback ?? null,
        routed_to_google: routed,
      })
      .select("id")
      .single();

    if (error) {
      console.error(error);
      return json({ error: "Unable to save review" }, 500);
    }

    // Counted with captured forms and direct lead posts, so one visitor's
    // limit covers all three.
    if (caller.kind === "browser") {
      await supabase.from("website_form_captures").insert({
        client_id: client.id,
        lead_id: null,
        page_url: request.headers.get("referer")?.slice(0, 500) ?? null,
        form_label: "review",
        ip_hash: ipHash,
        consent_found: false,
        consent_text: null,
        sms_consent: false,
        outcome: "created",
      });
    }

    return json({
      ok: true,
      review_id: data.id,
      google_review_url: routed ? client.google_review_url : null,
    });
  } catch (error) {
    console.error(error);
    return json({ error: "Unable to save review" }, 500);
  }
}
