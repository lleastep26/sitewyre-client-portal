import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveGoogleReviewUrl } from "@/lib/funnels/review-link";
import { isLikelyLinkPreviewBot } from "@/lib/funnels/link-preview-bots";

function expiredResponse() {
  return new Response(
    `<!doctype html><html><head><meta charset="utf-8"><title>Link expired</title></head><body style="font-family: system-ui, sans-serif; text-align: center; padding: 4rem 1.5rem; color: #3a2f28;"><h1 style="font-size: 1.25rem;">This link has expired</h1><p>Please contact the business directly if you'd like to leave a review.</p></body></html>`,
    { status: 404, headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}

async function resolve(token: string) {
  const supabase = createAdminClient();
  const { data: link } = await supabase
    .from("review_links")
    .select("*")
    .eq("token", token)
    .maybeSingle();
  if (!link) return { link: null, dest: null, supabase };

  const { data: client } = await supabase
    .from("clients")
    .select("google_review_url, google_place_id")
    .eq("id", link.client_id)
    .maybeSingle();
  const dest = client ? resolveGoogleReviewUrl(client) : null;
  return { link, dest, supabase };
}

export async function GET(
  request: Request,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params;
  const { link, dest, supabase } = await resolve(token);
  if (!link || !dest) return expiredResponse();

  const userAgent = request.headers.get("user-agent") ?? "";
  if (!link.clicked_at && !isLikelyLinkPreviewBot(userAgent)) {
    await supabase
      .from("review_links")
      .update({ clicked_at: new Date().toISOString() })
      .eq("token", token);
  }

  return NextResponse.redirect(dest, { status: 302 });
}

// A HEAD request (some link-unfurlers probe with HEAD before GET) must
// never count as a click, by definition of the method — no clicked_at
// write here regardless of the state checked.
export async function HEAD(
  _request: Request,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params;
  const { link, dest } = await resolve(token);
  if (!link || !dest) return new Response(null, { status: 404 });
  return new Response(null, { status: 302, headers: { Location: dest } });
}
