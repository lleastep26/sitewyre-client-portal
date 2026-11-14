import { beforeEach, describe, expect, it, vi } from "vitest";
import { classifyLeadCaller } from "@/lib/leads/api-guard";

const resolveClient = vi.fn();
vi.mock("@/lib/crm/resolve-client", () => ({ resolveClient }));

type Row = Record<string, unknown>;
let capturesFromIp: number;
let capturesToday: number;
let capturesInserted: Row[];
let reviewsInserted: Row[];
const fakeSupabase = {
  from(table: string) {
    if (table === "website_form_captures") {
      return {
        select: () => ({
          eq: (col: string) => ({
            gte: async () => ({ count: col === "ip_hash" ? capturesFromIp : capturesToday }),
          }),
        }),
        insert: async (row: Row) => (capturesInserted.push(row), { error: null }),
      };
    }
    if (table === "reviews") {
      return {
        insert: (row: Row) => {
          reviewsInserted.push(row);
          return { select: () => ({ single: async () => ({ data: { id: "review1" }, error: null }) }) };
        },
      };
    }
    throw new Error(`unexpected table ${table}`);
  },
};
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => fakeSupabase }));

const SECRET = "s3cret-value-for-tests";
const review = { site_key: "abc", rating: 5, name: "Jo", feedback: "Great job" };
const site = { origin: "https://www.acme-plumbing.com", referer: "https://www.acme-plumbing.com/review" };

async function post(headers: Record<string, string>, body: unknown = review) {
  const { POST } = await import("@/app/api/reviews/rating/route");
  return POST(
    new Request("http://localhost/api/reviews/rating", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.5", ...headers },
      body: JSON.stringify(body),
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  vi.stubEnv("LEADS_API_SECRET", SECRET);
  capturesFromIp = 0;
  capturesToday = 0;
  capturesInserted = [];
  reviewsInserted = [];
  resolveClient.mockResolvedValue({
    id: "client1",
    domain: "acme-plumbing.com",
    live_site_url: null,
    google_review_url: "https://g.page/acme/review",
  });
});

describe("POST /api/reviews/rating: browser posts", () => {
  it("stores a rating from the client's own website and counts it against the visitor's limit", async () => {
    const res = await post(site);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      review_id: "review1",
      google_review_url: "https://g.page/acme/review",
    });
    expect(reviewsInserted).toHaveLength(1);
    expect(capturesInserted).toEqual([
      expect.objectContaining({ client_id: "client1", lead_id: null, form_label: "review", outcome: "created" }),
    ]);
    expect(String(capturesInserted[0].ip_hash)).not.toContain("203.0.113.5");
  });

  it("refuses a rating from any other website", async () => {
    const res = await post({ origin: "https://evil.example" });
    expect(res.status).toBe(403);
    expect(reviewsInserted).toEqual([]);
  });

  it("quietly drops a submission that filled the hidden trap field", async () => {
    const res = await post(site, { ...review, website: "http://spam.example" });
    expect(await res.json()).toEqual({ ok: true });
    expect(reviewsInserted).toEqual([]);
  });

  it("limits how many one visitor, and one client's website, can send", async () => {
    capturesFromIp = 10;
    expect((await post(site)).status).toBe(429);
    capturesFromIp = 0;
    capturesToday = 300;
    expect((await post(site)).status).toBe(429);
    expect(reviewsInserted).toEqual([]);
  });
});

describe("POST /api/reviews/rating: server calls (n8n)", () => {
  it("still accepts n8n's unsigned call while its node hasn't been given the secret", async () => {
    const res = await post({});
    expect(res.status).toBe(200);
    expect(reviewsInserted).toHaveLength(1);
    // No visitor to count: nothing is recorded against a limit.
    expect(capturesInserted).toEqual([]);
  });

  it("accepts the right secret and always refuses a wrong one", async () => {
    expect((await post({ "x-leads-secret": SECRET })).status).toBe(200);
    expect((await post({ "x-leads-secret": "wrong" })).status).toBe(401);
    expect(reviewsInserted).toHaveLength(1);
  });
});

describe("classifyLeadCaller: servers that don't have the secret yet", () => {
  const req = (headers: Record<string, string>) =>
    new Request("http://localhost/x", { method: "POST", headers });

  it("lets an unsigned server call through only when told that server isn't ready", () => {
    const env = { LEADS_API_SECRET: SECRET };
    expect(classifyLeadCaller(req({}), env, { requireSecretForServers: false })).toEqual({ kind: "server" });
    expect(classifyLeadCaller(req({}), env)).toMatchObject({ kind: "rejected", status: 401 });
    expect(classifyLeadCaller(req({ "x-leads-secret": "wrong" }), env, { requireSecretForServers: false })).toMatchObject({
      kind: "rejected",
    });
  });
});
