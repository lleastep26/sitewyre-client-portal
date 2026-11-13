import { createAdminClient } from "@/lib/supabase/admin";
import { json, options } from "@/lib/http/cors";
import { normalizeHost } from "@/lib/utils";
import { smsConsentText } from "@/lib/a2p/consent-text";

export function OPTIONS() {
  return options();
}

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

/**
 * What the website script needs to set itself up. The client is found by
 * site key, or (for sites built by the Site Generator, which doesn't know
 * the portal's site key) by the website's own domain.
 *
 * `enabled` is the chat bubble and `capture` is form capture; each is
 * switched on by the client. An unknown site gets both off and nothing else.
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const siteKey = params.get("site_key");
  const domain = normalizeHost(params.get("domain") ?? "");
  if (!siteKey && !domain) return json({ enabled: false, capture: false });

  const supabase = createAdminClient();
  const query = supabase
    .from("clients")
    .select("business_name, brand_colors, chat_widget_enabled, form_capture_enabled, site_key");
  const { data: client } = await (siteKey ? query.eq("site_key", siteKey) : query.eq("domain", domain)).maybeSingle();
  if (!client?.site_key) return json({ enabled: false, capture: false });

  const capture = client.form_capture_enabled === true;
  if (!client.chat_widget_enabled) {
    return json({ enabled: false, capture, site_key: client.site_key });
  }

  const colors = (client.brand_colors ?? {}) as Record<string, string>;
  const color = [colors.primary, colors.accent].find((c) => typeof c === "string" && HEX_COLOR.test(c));
  const business = client.business_name ?? "us";

  return json({
    enabled: true,
    capture,
    site_key: client.site_key,
    business_name: business,
    color: color ?? null,
    turnstile_site_key: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || null,
    // Same wording as the SMS disclosure on the generated site's lead form.
    consent_text: smsConsentText(business),
  });
}
