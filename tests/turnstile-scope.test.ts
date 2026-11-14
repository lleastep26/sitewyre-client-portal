import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Turnstile applies only to forms the portal hosts. These tests set both
 * Turnstile keys, as production will have, and check that everything a
 * client's own website calls still works with no Turnstile answer, while
 * the portal's own forms require one.
 */

const ingestLead = vi.fn();
const resolveClient = vi.fn();
vi.mock("@/lib/leads/ingest", () => ({ ingestLead }));
vi.mock("@/lib/crm/resolve-client", () => ({ resolveClient }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": "203.0.113.9" }),
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT ${url}`);
  },
}));

type Row = Record<string, unknown>;
let reviewsInserted: Row[];
const fakeSupabase = {
  from(table: string) {
    if (table === "clients") {
      const chain = {
        select: () => chain,
        eq: () => chain,
        maybeSingle: async () => ({ data: { id: "client1", business_name: "Acme", site_key: "abc", user_id: null } }),
        single: async () => ({ data: { id: "client1", business_name: "Acme", site_key: "abc", user_id: null } }),
      };
      return chain;
    }
    if (table === "reviews") {
      return {
        insert: (row: Row) => {
          reviewsInserted.push(row);
          return { select: () => ({ single: async () => ({ data: { id: "review1" }, error: null }) }) };
        },
      };
    }
    if (table === "website_form_captures") {
      return {
        select: () => ({ eq: () => ({ gte: async () => ({ count: 0 }) }) }),
        insert: async () => ({ error: null }),
      };
    }
    throw new Error(`unexpected table ${table}`);
  },
};
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => fakeSupabase }));

let siteverify: ReturnType<typeof vi.fn>;

function jsonRequest(path: string, body: unknown) {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://acme-plumbing.com" },
    body: JSON.stringify(body),
  });
}
function fd(fields: Record<string, string>) {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.set(k, v);
  return form;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "site-key");
  vi.stubEnv("TURNSTILE_SECRET_KEY", "secret-key");
  reviewsInserted = [];
  ingestLead.mockResolvedValue({ leadId: "lead1", contactId: "contact1" });
  resolveClient.mockResolvedValue({
    id: "client1",
    google_review_url: null,
    domain: "acme-plumbing.com",
    live_site_url: null,
  });
  siteverify = vi.fn(async () => ({ json: async () => ({ success: true }) }));
  vi.stubGlobal("fetch", siteverify);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("client websites: no Turnstile, even with the keys set", () => {
  it("/api/leads takes a lead with no Turnstile answer and never calls Cloudflare", async () => {
    const { POST } = await import("@/app/api/leads/route");
    const res = await POST(
      jsonRequest("/api/leads", { site_key: "abc", name: "Jo", phone: "405-555-0142", message: "Need a quote" }),
    );
    expect(res.status).toBe(200);
    expect(ingestLead).toHaveBeenCalledTimes(1);
    expect(siteverify).not.toHaveBeenCalled();
  });

  it("/api/leads ignores a Turnstile answer an older site still sends", async () => {
    const { POST } = await import("@/app/api/leads/route");
    const res = await POST(
      jsonRequest("/api/leads", {
        site_key: "abc",
        name: "Jo",
        phone: "405-555-0142",
        message: "Need a quote",
        turnstile_token: "stale-or-bogus",
      }),
    );
    expect(res.status).toBe(200);
    expect(siteverify).not.toHaveBeenCalled();
  });

  it("/api/reviews/rating takes a rating with no Turnstile answer", async () => {
    const { POST } = await import("@/app/api/reviews/rating/route");
    const res = await POST(jsonRequest("/api/reviews/rating", { site_key: "abc", rating: 5, name: "Jo" }));
    expect(res.status).not.toBe(403);
    expect(reviewsInserted).toHaveLength(1);
    expect(siteverify).not.toHaveBeenCalled();
  });
});

describe("portal-hosted forms: Turnstile required once both keys are set", () => {
  const lead = { name: "Jo Smith", phone: "(512) 555-0100", message: "Need a quote for a water heater" };

  it("embedded lead form: refused without an answer, accepted with one Cloudflare confirms", async () => {
    const { submitEmbedLead } = await import("@/app/embed/lead/[siteKey]/actions");

    expect(await submitEmbedLead("abc", fd(lead))).toEqual({
      error: "Please complete the security check and try again.",
    });
    expect(ingestLead).not.toHaveBeenCalled();

    expect(await submitEmbedLead("abc", fd({ ...lead, turnstile_token: "good-token" }))).toEqual({ ok: true });
    expect(siteverify).toHaveBeenCalledTimes(1);
    expect(String(siteverify.mock.calls[0][0])).toContain("challenges.cloudflare.com/turnstile/v0/siteverify");
    expect(ingestLead).toHaveBeenCalledTimes(1);
  });

  it("embedded lead form: refused when Cloudflare rejects the answer", async () => {
    siteverify.mockResolvedValue({ json: async () => ({ success: false, "error-codes": ["invalid-input-response"] }) });
    const { submitEmbedLead } = await import("@/app/embed/lead/[siteKey]/actions");
    expect(await submitEmbedLead("abc", fd({ ...lead, turnstile_token: "bad" }))).toEqual({
      error: "Please complete the security check and try again.",
    });
    expect(ingestLead).not.toHaveBeenCalled();
  });

  it("booking form: refused without an answer", async () => {
    const { bookAppointment } = await import("@/app/book/[siteKey]/actions");
    const result = await bookAppointment(
      "abc",
      fd({ name: "Jo", phone: "5125550100", service_id: "svc1", start_at: "2026-11-16T15:00:00.000Z" }),
    );
    expect(result).toEqual({ error: "Please complete the security check and try again." });
  });
});

describe("Turnstile not fully set up", () => {
  it("portal forms work with no bot check when either key is missing, so a half-finished setup can't lock them", async () => {
    const { portalTurnstileSiteKey, verifyPortalFormTurnstile } = await import("@/lib/security/turnstile");

    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "");
    expect(portalTurnstileSiteKey()).toBeNull();
    expect(await verifyPortalFormTurnstile(null)).toEqual({ ok: true, skipped: true });

    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "site-key");
    vi.stubEnv("TURNSTILE_SECRET_KEY", "");
    expect(portalTurnstileSiteKey()).toBeNull();
    expect(await verifyPortalFormTurnstile(null)).toEqual({ ok: true, skipped: true });
    expect(siteverify).not.toHaveBeenCalled();

    vi.stubEnv("TURNSTILE_SECRET_KEY", "secret-key");
    expect(portalTurnstileSiteKey()).toBe("site-key");
    expect((await verifyPortalFormTurnstile(null)).ok).toBe(false);
  });
});
