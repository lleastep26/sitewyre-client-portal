import { beforeEach, describe, expect, it, vi } from "vitest";

const ingestLead = vi.fn();
vi.mock("@/lib/leads/ingest", () => ({ ingestLead }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": "203.0.113.9", referer: "https://acme-plumbing.com/contact" }),
}));

type Row = Record<string, unknown>;
let clientRow: Row | null;
let capturesFromIp: number;
let capturesInserted: Row[];

const fakeSupabase = {
  from(table: string) {
    if (table === "clients") {
      return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: clientRow }) }) }) };
    }
    if (table === "website_form_captures") {
      return {
        select: () => ({ eq: () => ({ gte: async () => ({ count: capturesFromIp }) }) }),
        insert: async (row: Row) => (capturesInserted.push(row), { error: null }),
      };
    }
    throw new Error(`unexpected table ${table}`);
  },
};
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => fakeSupabase }));

function fd(fields: Record<string, string>) {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.set(k, v);
  return form;
}
const good = { name: "Jo Smith", phone: "(512) 555-0100", email: "", message: "Need a quote for a water heater" };

async function submit(fields: Record<string, string>) {
  const { submitEmbedLead } = await import("@/app/embed/lead/[siteKey]/actions");
  return submitEmbedLead("abc", fd(fields));
}

beforeEach(() => {
  vi.clearAllMocks();
  clientRow = { id: "client1", business_name: "Acme Plumbing", site_key: "abc" };
  capturesFromIp = 0;
  capturesInserted = [];
  ingestLead.mockResolvedValue({ leadId: "lead1", contactId: "contact1" });
});

describe("submitEmbedLead", () => {
  it("creates a textable lead, because the form shows the consent wording itself", async () => {
    expect(await submit(good)).toEqual({ ok: true });
    expect(ingestLead).toHaveBeenCalledWith(fakeSupabase, clientRow, {
      name: "Jo Smith",
      phone: "+15125550100",
      email: null,
      message: "Need a quote for a water heater",
      source: "website_form",
      smsOptIn: true,
      consentShown: true,
    });
    expect(capturesInserted).toEqual([
      expect.objectContaining({
        lead_id: "lead1",
        form_label: "sitewyre-lead-form",
        sms_consent: true,
        consent_found: true,
        consent_text: expect.stringContaining("text messages from Acme Plumbing"),
        page_url: "https://acme-plumbing.com/contact",
      }),
    ]);
  });

  it("asks for a name, a full phone number and a message", async () => {
    for (const bad of [{ ...good, name: "" }, { ...good, phone: "555-0100" }, { ...good, message: "" }]) {
      expect(await submit(bad)).toEqual({ error: expect.stringContaining("phone number with area code") });
    }
    expect(ingestLead).not.toHaveBeenCalled();
  });

  it("quietly drops a submission that filled the hidden trap field", async () => {
    expect(await submit({ ...good, website: "http://spam.example" })).toEqual({ ok: true });
    expect(ingestLead).not.toHaveBeenCalled();
  });

  it("limits how many one visitor can send", async () => {
    capturesFromIp = 10;
    expect(await submit(good)).toEqual({ error: expect.stringContaining("Too many requests") });
    expect(ingestLead).not.toHaveBeenCalled();
  });

  it("refuses an unknown site key", async () => {
    clientRow = null;
    expect(await submit(good)).toEqual({ error: "This form isn't available." });
  });
});
