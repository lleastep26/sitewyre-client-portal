import { createHash, randomBytes } from "node:crypto";
import type { ClientRow } from "@/lib/supabase/types";
import { getAppUrl } from "@/lib/supabase/env";
import { normalizeHost } from "@/lib/utils";

/** Visitor messages allowed in one conversation. */
export const CHAT_MAX_VISITOR_MESSAGES = 30;
/** Longest single visitor message. */
export const CHAT_MAX_MESSAGE_LENGTH = 500;
/** New conversations one IP address may start per hour. */
export const CHAT_MAX_SESSIONS_PER_IP_PER_HOUR = 5;
/** AI chat replies one client's widget may send in 24 hours. */
export const CHAT_DAILY_REPLY_CAP = 200;
/** Shortest gap between two messages in one conversation. */
export const CHAT_MIN_MESSAGE_GAP_MS = 1_500;

export function newSessionToken(): string {
  return randomBytes(32).toString("hex");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** IPs are only ever stored hashed, salted so the hash can't be reversed
 * with a lookup table. */
export function hashIp(ip: string): string {
  const salt = process.env.INTERNAL_API_SECRET ?? "sitewyre-chat";
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex");
}

export function clientIp(request: Request): string | null {
  return (
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    null
  );
}

/**
 * The widget only works from the client's own website: the request's
 * Origin must be the client's domain or live site. The portal's own origin
 * is allowed too (for previews), and localhost outside production.
 */
export function isAllowedChatOrigin(
  origin: string | null,
  client: Pick<ClientRow, "domain" | "live_site_url">,
): boolean {
  if (!origin) return false;
  const host = normalizeHost(origin);
  if (!host) return false;

  const allowed = new Set<string>();
  if (client.domain) allowed.add(normalizeHost(client.domain));
  if (client.live_site_url) allowed.add(normalizeHost(client.live_site_url));
  allowed.add(normalizeHost(getAppUrl()));
  if (process.env.NODE_ENV !== "production") allowed.add("localhost");
  allowed.delete("");

  return allowed.has(host);
}
