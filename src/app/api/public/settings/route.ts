import { createAdminClient } from "@/lib/supabase/admin";
import { json, options } from "@/lib/http/cors";

export function OPTIONS() {
  return options();
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const siteKey = url.searchParams.get("site_key");
  const domain = url.searchParams.get("domain");
  if (!siteKey && !domain) {
    return json({ error: "site_key or domain required" }, 400);
  }

  const supabase = createAdminClient();
  let query = supabase
    .from("clients")
    .select("business_name, google_review_url, brand_colors, phone, site_key, domain");
  if (siteKey) query = query.eq("site_key", siteKey);
  else query = query.eq("domain", domain!);

  const { data } = await query.maybeSingle();
  if (!data) return json({ error: "Not found" }, 404);
  return json({
    business_name: data.business_name,
    google_review_url: data.google_review_url,
    brand_colors: data.brand_colors,
    phone: data.phone,
  });
}
