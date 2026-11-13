import type { SupabaseClient } from "@supabase/supabase-js";
import type { ClientRow, Database } from "@/lib/supabase/types";
import { getAppUrl } from "@/lib/supabase/env";
import { normalizeHost } from "@/lib/utils";

type Admin = SupabaseClient<Database>;

/** A sighting is only written again after this long, so a busy website
 * doesn't cause a database write on every page view. */
export const SEEN_WRITE_INTERVAL_MS = 60 * 60_000;

type SeenClient = Pick<ClientRow, "id" | "website_script_seen_at" | "website_script_seen_host">;

/**
 * Notes that the website script just loaded on `origin`. Called from the
 * script's config request. The portal's own pages and local previews
 * don't count as the client's website.
 */
export async function recordScriptSeen(
  supabase: Admin,
  client: SeenClient,
  origin: string | null,
  now: Date = new Date(),
): Promise<void> {
  const host = normalizeHost(origin ?? "");
  if (!host || host === "localhost" || host === normalizeHost(getAppUrl())) return;

  const last = client.website_script_seen_at ? Date.parse(client.website_script_seen_at) : 0;
  const sameHost = client.website_script_seen_host === host;
  if (sameHost && now.getTime() - last < SEEN_WRITE_INTERVAL_MS) return;

  await supabase
    .from("clients")
    .update({ website_script_seen_at: now.toISOString(), website_script_seen_host: host })
    .eq("id", client.id);
}

export type WebsiteStatus =
  /** No website address saved yet. */
  | { state: "no_domain" }
  /** The script has never loaded anywhere. */
  | { state: "not_seen" }
  /** The script last loaded on the client's saved website. */
  | { state: "connected"; host: string; seenAt: string }
  /** The script last loaded somewhere other than the saved website. */
  | { state: "other_site"; host: string; seenAt: string };

export function websiteStatus(
  client: Pick<ClientRow, "domain" | "live_site_url" | "website_script_seen_at" | "website_script_seen_host">,
): WebsiteStatus {
  const own = [client.domain, client.live_site_url].map((v) => normalizeHost(v ?? "")).filter(Boolean);
  const host = client.website_script_seen_host;
  const seenAt = client.website_script_seen_at;
  if (host && seenAt) {
    return own.includes(host)
      ? { state: "connected", host, seenAt }
      : { state: "other_site", host, seenAt };
  }
  return own.length ? { state: "not_seen" } : { state: "no_domain" };
}
