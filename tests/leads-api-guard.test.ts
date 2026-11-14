import { beforeEach, describe, expect, it, vi } from "vitest";
import { classifyLeadCaller } from "@/lib/leads/api-guard";

const ingestLead = vi.fn();
const resolveClient = vi.fn();
vi.mock("@/lib/leads/ingest", () => ({ ingestLead }));
vi.mock("@/lib/crm/resolve-client", () => ({ resolveClient }));

type Row = Record<string, unknown>;
let capturesFromIp: number;
let capturesToday: number;
let capturesInserted: Row[];
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
    throw new Error(`unexpected table ${table}`);
  },
};
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => fakeSupabase }));

const SECRET = "s3cret-value-for-tests";
const lead = { site_key: "abc", name: "Jo Smith", phone: "405-555-0142", message: "Need a quote" };

function req(headers: Record<string, string>, body: unknown = lead) {
  return new Request("http://localhost/api/leads", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.5", ...headers },
    body: JSON.stringify(body),
  });
}
async function post(headers: Record<string, string>, body: unknown = lead) {
  const { POST } = await import("@/app/api/leads/route");
  return POST(req(headers, body));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  vi.stubEnv("LEADS_API_SECRET", SECRET);
  capturesFromIp = 0;
  capturesToday = 0;
  capturesInserted = [];
  ingestLead.mockResolvedValue({ leadId: "lead1", contactId: "contact1" });
  resolveClient.mockResolvedValue({
    id: "client1",
    domain: "okcexclusivecleaning.com",
    live_site_url: "https://exclusive-cleaning-services.vercel.app/",
  });
});

describe("classifyLeadCaller", () => {
  const env = { LEADS_API_SECRET: SECRET };

  it("accepts a server that sends the right secret", () => {
    expect(classifyLeadCaller(req({ "x-leads-secret": SECRET }), env)).toEqual({ kind: "server" });
  });

  it("refuses a wrong secret, even when an origin is sent too", () => {
    expect(
      classifyLeadCaller(req({ "x-leads-secret": "nope", origin: "https://okcexclusivecleaning.com" }), env),
    ).toMatchObject({ kind: "rejected", status: 401 });
  });

  it("ignores a secret header while none is configured, so n8n can send it before the env var exists", () => {
    // The real rollout order: n8n gets the secret first.
    expect(classifyLeadCaller(req({ "x-leads-secret": SECRET }), {})).toEqual({ kind: "server" });
    // Not treated as proof of anything: with an Origin it's still a browser.
    expect(
      classifyLeadCaller(req({ "x-leads-secret": "anything", origin: "https://evil.example" }), {}),
    ).toEqual({ kind: "browser", origin: "https://evil.example" });
  });

  it("treats a request with an Origin as a browser", () => {
    expect(classifyLeadCaller(req({ origin: "https://www.okcexclusivecleaning.com" }), env)).toEqual({
      kind: "browser",
      origin: "https://www.okcexclusivecleaning.com",
    });
  });

  it("refuses a call with no origin and no secret once the secret is configured", () => {
    expect(classifyLeadCaller(req({}), env)).toMatchObject({ kind: "rejected", status: 401 });
  });

  it("still lets that call through until the secret is configured, so n8n can be updated first", () => {
    expect(classifyLeadCaller(req({}), {})).toEqual({ kind: "server" });
    expect(classifyLeadCaller(req({}), { LEADS_API_SECRET: "  " })).toEqual({ kind: "server" });
  });
});

describe("POST /api/leads: server calls (n8n)", () => {
  it("stores the lead with the right secret, with no visitor limits", async () => {
    capturesFromIp = 999;
    capturesToday = 999;
    const res = await post({ "x-leads-secret": SECRET });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, lead_id: "lead1", contact_id: "contact1" });
    expect(ingestLead).toHaveBeenCalledTimes(1);
    expect(capturesInserted).toEqual([]);
  });

  it("refuses a wrong or missing secret", async () => {
    expect((await post({ "x-leads-secret": "wrong" })).status).toBe(401);
    expect((await post({})).status).toBe(401);
    expect(ingestLead).not.toHaveBeenCalled();
  });

  it("accepts an unsigned server call only while no secret is configured", async () => {
    vi.stubEnv("LEADS_API_SECRET", "");
    expect((await post({})).status).toBe(200);
    expect(ingestLead).toHaveBeenCalledTimes(1);
  });

  it("accepts n8n's call carrying the secret before the env var has been set", async () => {
    vi.stubEnv("LEADS_API_SECRET", "");
    expect((await post({ "x-leads-secret": SECRET })).status).toBe(200);
    expect(ingestLead).toHaveBeenCalledTimes(1);
  });
});

describe("POST /api/leads: browser posts from a client's website", () => {
  const site = { origin: "https://www.okcexclusivecleaning.com", referer: "https://www.okcexclusivecleaning.com/contact" };

  it("keeps Exclusive Cleaning's direct form posts working", async () => {
    // Exactly what okcexclusive-nextjs/src/lib/portal-leads.ts sends.
    const res = await post(site, {
      site_key: "af6e62ad7807180fcf897894",
      name: "Jo Smith",
      phone: "(405) 555-0142",
      email: "jo@example.org",
      message: "Need a deep clean",
      source: "website_form",
      sms_opt_in: true,
    });
    expect(res.status).toBe(200);
    expect(ingestLead).toHaveBeenCalledWith(
      fakeSupabase,
      expect.objectContaining({ id: "client1" }),
      expect.objectContaining({ phone: "(405) 555-0142", smsOptIn: true, consentShown: true }),
    );
    expect(capturesInserted).toEqual([
      expect.objectContaining({
        client_id: "client1",
        lead_id: "lead1",
        form_label: "direct-post",
        outcome: "created",
        page_url: "https://www.okcexclusivecleaning.com/contact",
      }),
    ]);
    expect(String(capturesInserted[0].ip_hash)).not.toContain("203.0.113.5");
  });

  it("accepts the client's other saved address too", async () => {
    expect((await post({ origin: "https://exclusive-cleaning-services.vercel.app" })).status).toBe(200);
  });

  it("refuses a post from any other website", async () => {
    const res = await post({ origin: "https://evil.example" });
    expect(res.status).toBe(403);
    expect(ingestLead).not.toHaveBeenCalled();
    expect(capturesInserted).toEqual([]);
  });

  it("quietly drops a submission that filled the hidden trap field", async () => {
    const res = await post(site, { ...lead, website: "http://spam.example" });
    expect(await res.json()).toEqual({ ok: true });
    expect(ingestLead).not.toHaveBeenCalled();
  });

  it("checks the website before the trap field, so a bot on another site learns nothing", async () => {
    expect((await post({ origin: "https://evil.example" }, { ...lead, website: "x" })).status).toBe(403);
  });

  it("limits how many one visitor, and one client's website, can send", async () => {
    capturesFromIp = 10;
    expect((await post(site)).status).toBe(429);
    capturesFromIp = 0;
    capturesToday = 300;
    expect((await post(site)).status).toBe(429);
    expect(ingestLead).not.toHaveBeenCalled();
  });

  it("applies the same checks whether or not the secret is configured", async () => {
    vi.stubEnv("LEADS_API_SECRET", "");
    expect((await post({ origin: "https://evil.example" })).status).toBe(403);
    expect((await post(site)).status).toBe(200);
  });
});
