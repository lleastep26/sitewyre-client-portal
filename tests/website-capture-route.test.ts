import { beforeEach, describe, expect, it, vi } from "vitest";
import { captureTiming } from "@/lib/website/capture";

const ingestLead = vi.fn();
vi.mock("@/lib/leads/ingest", () => ({ ingestLead }));

type Row = Record<string, unknown>;
let clientRow: Row | null;
let capturesFromIp: number;
let capturesToday: number;
let recentLeads: Row[];
let capturesInserted: Row[];

const fakeSupabase = {
  from(table: string) {
    if (table === "clients") {
      return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: clientRow }) }) }) };
    }
    if (table === "website_form_captures") {
      return {
        select: () => ({
          eq: (col: string) => ({
            gte: async () => ({ count: col === "ip_hash" ? capturesFromIp : capturesToday }),
          }),
        }),
        insert: async (row: Row) => {
          capturesInserted.push(row);
          return { error: null };
        },
      };
    }
    if (table === "leads") {
      const chain = {
        select: () => chain,
        eq: () => chain,
        gte: () => chain,
        order: () => chain,
        limit: async () => ({ data: recentLeads }),
      };
      return chain;
    }
    throw new Error(`unexpected table ${table}`);
  },
};
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => fakeSupabase }));

const SITE = "https://www.acme-plumbing.com";

async function capture(body: unknown, origin: string | null = SITE) {
  const { POST } = await import("@/app/api/public/capture/route");
  return POST(
    new Request("http://localhost/api/public/capture", {
      method: "POST",
      // Sent as text/plain by the script, so no pre-flight is needed.
      headers: {
        "content-type": "text/plain;charset=UTF-8",
        "x-forwarded-for": "203.0.113.5",
        ...(origin ? { origin } : {}),
      },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
}

const lead = {
  site_key: "abc",
  name: "Jo Smith",
  phone: "(512) 555-0100",
  email: "jo@example.com",
  message: "My water heater is leaking",
  page_url: "https://www.acme-plumbing.com/contact",
  form_label: "contact-form",
};

beforeEach(() => {
  vi.clearAllMocks();
  captureTiming.settleMs = 0;
  clientRow = {
    id: "client1",
    site_key: "abc",
    domain: "acme-plumbing.com",
    live_site_url: null,
    form_capture_enabled: true,
    website_consent_confirmed_at: null,
  };
  capturesFromIp = 0;
  capturesToday = 0;
  recentLeads = [];
  capturesInserted = [];
  ingestLead.mockResolvedValue({ leadId: "lead1", contactId: "contact1" });
});

describe("POST /api/public/capture", () => {
  it("creates the lead, without SMS consent until the client confirms their consent wording", async () => {
    const res = await capture(lead);
    expect(await res.json()).toEqual({ ok: true });
    expect(ingestLead).toHaveBeenCalledWith(fakeSupabase, clientRow, {
      name: "Jo Smith",
      phone: "+15125550100",
      email: "jo@example.com",
      message: "My water heater is leaking",
      source: "website_form",
      smsOptIn: false,
      consentShown: false,
    });
    expect(capturesInserted).toEqual([
      expect.objectContaining({
        client_id: "client1",
        lead_id: "lead1",
        outcome: "created",
        sms_consent: false,
        consent_found: false,
        page_url: "https://www.acme-plumbing.com/contact",
        form_label: "contact-form",
      }),
    ]);
    // The visitor's IP is only ever stored hashed.
    expect(String(capturesInserted[0].ip_hash)).not.toContain("203.0.113.5");
  });

  it("marks the lead textable once the client has confirmed consent, and keeps the wording the form showed", async () => {
    clientRow = { ...clientRow, website_consent_confirmed_at: "2026-11-13T20:00:00.000Z" };
    await capture({ ...lead, consent_text: "By submitting, you agree to receive text messages… Reply STOP to opt out." });
    expect(ingestLead).toHaveBeenCalledWith(
      fakeSupabase,
      clientRow,
      expect.objectContaining({ smsOptIn: true, consentShown: true }),
    );
    expect(capturesInserted[0]).toMatchObject({ sms_consent: true, consent_found: true });
  });

  it("takes an email-only enquiry with an empty phone", async () => {
    await capture({ site_key: "abc", email: "jo@example.com", message: "Do you service Austin?" });
    expect(ingestLead).toHaveBeenCalledWith(
      fakeSupabase,
      clientRow,
      expect.objectContaining({ phone: "", email: "jo@example.com", name: "jo" }),
    );
  });

  it("does nothing when the client hasn't turned form capture on", async () => {
    clientRow = { ...clientRow, form_capture_enabled: false };
    const res = await capture(lead);
    expect(await res.json()).toEqual({ ok: false, reason: "capture_off" });
    expect(ingestLead).not.toHaveBeenCalled();
    expect(capturesInserted).toEqual([]);
  });

  it("refuses a request from any other website, or with no origin", async () => {
    expect((await capture(lead, "https://evil.example")).status).toBe(403);
    expect((await capture(lead, null)).status).toBe(403);
    expect(ingestLead).not.toHaveBeenCalled();
  });

  it("drops a submission that isn't a lead", async () => {
    const res = await capture({ site_key: "abc", email: "jo@example.com" });
    expect(await res.json()).toEqual({ ok: false, reason: "not_a_lead" });
    expect(ingestLead).not.toHaveBeenCalled();
  });

  it("records a duplicate instead of creating a second lead", async () => {
    recentLeads = [
      {
        id: "lead_direct",
        phone: "+15125550100",
        email: null,
        message: "My water heater is leaking",
        created_at: new Date().toISOString(),
      },
    ];
    const res = await capture(lead);
    expect(await res.json()).toEqual({ ok: true, duplicate: true });
    expect(ingestLead).not.toHaveBeenCalled();
    expect(capturesInserted).toEqual([
      expect.objectContaining({ lead_id: "lead_direct", outcome: "duplicate" }),
    ]);
  });

  it("limits how many one visitor, and one website, can send", async () => {
    capturesFromIp = 10;
    expect((await capture(lead)).status).toBe(429);
    capturesFromIp = 0;
    capturesToday = 300;
    expect((await capture(lead)).status).toBe(429);
    expect(ingestLead).not.toHaveBeenCalled();
  });

  it("rejects a body that isn't JSON or has no site key", async () => {
    expect((await capture("not json")).status).toBe(400);
    expect((await capture({ name: "Jo", phone: "5125550100" })).status).toBe(400);
  });
});
