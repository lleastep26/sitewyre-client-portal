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
 * it is set, such a request is still let through, so the endpoint can be
 * deployed before n8n has been given the secret.
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
): LeadCaller {
  const expected = env.LEADS_API_SECRET?.trim() || null;
  const given = request.headers.get(LEADS_SECRET_HEADER)?.trim() || null;

  if (given) {
    // A secret that's wrong is always refused, whatever else was sent.
    if (expected && sameSecret(given, expected)) return { kind: "server" };
    return { kind: "rejected", status: 401, error: "Invalid API secret" };
  }

  const origin = request.headers.get("origin");
  if (origin) return { kind: "browser", origin };

  if (expected) {
    return {
      kind: "rejected",
      status: 401,
      error: `Server calls need the ${LEADS_SECRET_HEADER} header`,
    };
  }
  return { kind: "server" };
}
