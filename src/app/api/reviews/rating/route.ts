import { createAdminClient } from "@/lib/supabase/admin";
import { resolveClient } from "@/lib/crm/resolve-client";
import { reviewIngestSchema } from "@/lib/validation/leads";
import { json, options } from "@/lib/http/cors";

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

  const parsed = reviewIngestSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: "Invalid payload", details: parsed.error.flatten() }, 400);
  }

  const input = parsed.data;
  try {
    const supabase = createAdminClient();
    const client = await resolveClient(supabase, input);
    if (!client) return json({ error: "Unknown client" }, 400);

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
