import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Who is calling POST /api/leads, and whether they may.
 *
 * Two kinds of caller are allowed:
 *
 * - A server (n8n, which forwards leads from the generated sites' webhook).
 *   It proves itself with the shared secret in the X-Leads-Secret header,
 *   which must equal LEADS_API_SECRET.
 * - A browser on a client's own website. Browsers always send an Origin
 *   header on this kind of request and can't fake it; the route then
 *   checks that origin against the client's saved website, and applies
 *   per-visitor and per-client limits and a hidden trap field.
 *
 * A request with neither is refused once LEADS_API_SECRET is set. Until
 * it is set, a server call is let through with or without a secret
 * header, so n8n can be given the secret first and nothing is refused in
 * between.
 */

export const LEADS_SECRET_HEADER = "x-leads-secret";

export type LeadCaller =
  | { kind: "server" }
  | { kind: "browser"; origin: string }
  | { kind: "rejected"; status: 401; error: string };

function sameSecret(given: string, expected: string): boolean {
  // Hashing first gives equal-length inputs, which timingSafeEqual needs.
  const a = createHash("sha256").update(given).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

export function classifyLeadCaller(
  request: Request,
  env: Record<string, string | undefined> = process.env,
  opts: {
    /**
     * False while a server that calls this endpoint hasn't been given the
     * secret yet: its unsigned calls are still let through even with
     * LEADS_API_SECRET set. A wrong secret is refused either way.
     */
    requireSecretForServers?: boolean;
  } = {},
): LeadCaller {
  const expected = env.LEADS_API_SECRET?.trim() || null;
  const given = request.headers.get(LEADS_SECRET_HEADER)?.trim() || null;

  if (given && expected) {
    // Once a secret is configured, a wrong one is always refused,
    // whatever else was sent.
    if (sameSecret(given, expected)) return { kind: "server" };
    return { kind: "rejected", status: 401, error: "Invalid API secret" };
  }
  // With no secret configured yet there is nothing to compare against, so
  // a secret header is ignored rather than refused. n8n is given the
  // secret before LEADS_API_SECRET is set here, and its calls must keep
  // working in between.

  const origin = request.headers.get("origin");
  if (origin) return { kind: "browser", origin };

  if (expected && opts.requireSecretForServers !== false) {
    return {
      kind: "rejected",
      status: 401,
      error: `Server calls need the ${LEADS_SECRET_HEADER} header`,
    };
  }
  return { kind: "server" };
}
