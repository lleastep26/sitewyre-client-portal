import { beforeEach, describe, expect, it, vi } from "vitest";

let fakeSupabase: unknown;
let fakeClient: { phone: string | null; forward_to_phone: string | null; business_name: string };
let fakeLeads: { id: string; name: string; phone: string; lifecycle_status: string }[];
let leadUpdates: unknown[];
let sentEvents: unknown[];
let sentSms: { to: string; from: string; body: string }[];

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => fakeSupabase,
}));
vi.mock("@/lib/crm/contacts", () => ({
  findOrCreateContact: async () => ({ id: "contact1", name: "A Customer" }),
}));
vi.mock("@/lib/inngest/client", () => ({
  inngest: { send: vi.fn((e: unknown) => { sentEvents.push(e); return Promise.resolve(undefined); }) },
}));
vi.mock("@/lib/push/web-push", () => ({
  sendPushToClient: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/adapters", () => ({
  getSmsProvider: () => ({
    send: (opts: { to: string; from: string; body: string }) => {
      sentSms.push(opts);
      return Promise.resolve({ id: "SM_owner", status: "queued" });
    },
  }),
}));
vi.mock("@/lib/a2p/sending", () => ({
  resolveSmsFrom: () => "+15555550100",
}));

function makeTable() {
  const chain = {
    select() {
      return chain;
    },
    eq() {
      return chain;
    },
    neq() {
      return chain;
    },
    in() {
      return chain;
    },
    gte() {
      return chain;
    },
    order() {
      return chain;
    },
    limit() {
      return chain;
    },
    update(patch: unknown) {
      leadUpdates.push(patch);
      return chain;
    },
    insert() {
      return Promise.resolve({ data: null, error: null });
    },
    maybeSingle: async () => ({ data: null }),
    then(resolve: (v: { error: null; data: unknown[] }) => void) {
      resolve({ error: null, data: fakeLeads });
    },
  };
  return chain;
}

function makeRequest(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return new Request("http://localhost:3000/api/twilio/webhook", {
    method: "POST",
    body: fd,
  });
}

const CLIENT_NUMBER = "+15555550100";
const CUSTOMER_NUMBER = "+15551234567";
const OWNER_PHONE = "+15129998888";

beforeEach(() => {
  leadUpdates = [];
  sentEvents = [];
  sentSms = [];
  fakeClient = { phone: OWNER_PHONE, forward_to_phone: null, business_name: "Test Co" };
  fakeLeads = [];
  fakeSupabase = {
    from(table: string) {
      if (table === "clients") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { id: "client1", twilio_phone_number: CLIENT_NUMBER, ...fakeClient },
              }),
            }),
          }),
        };
      }
      return makeTable();
    },
  };
});

describe("Twilio webhook — lead reply detection", () => {
  it("marks the most recent open lead replied and alerts the owner", async () => {
    fakeLeads = [{ id: "lead1", name: "Jo", phone: CUSTOMER_NUMBER, lifecycle_status: "new" }];
    const { POST } = await import("@/app/api/twilio/webhook/route");
    await POST(
      makeRequest({
        To: CLIENT_NUMBER,
        From: CUSTOMER_NUMBER,
        Body: "Yes please call me back",
        MessageSid: "SM1",
      }),
    );

    expect(leadUpdates).toContainEqual(
      expect.objectContaining({ lifecycle_status: "replied" }),
    );
    expect(sentEvents).toContainEqual({
      name: "portal/lead.replied",
      data: { clientId: "client1", leadId: "lead1" },
    });
    expect(sentSms).toContainEqual(
      expect.objectContaining({
        to: OWNER_PHONE,
        body: expect.stringContaining("Jo replied"),
      }),
    );
  });

  it("never treats a text from the owner's own phone as a lead reply", async () => {
    fakeLeads = [{ id: "lead1", name: "Jo", phone: OWNER_PHONE, lifecycle_status: "new" }];
    const { POST } = await import("@/app/api/twilio/webhook/route");
    await POST(
      makeRequest({
        To: CLIENT_NUMBER,
        From: OWNER_PHONE,
        Body: "On my way to the job",
        MessageSid: "SM2",
      }),
    );

    expect(leadUpdates).toHaveLength(0);
    expect(sentEvents).toHaveLength(0);
  });

  it("does nothing when no open lead matches the inbound number", async () => {
    fakeLeads = [];
    const { POST } = await import("@/app/api/twilio/webhook/route");
    await POST(
      makeRequest({
        To: CLIENT_NUMBER,
        From: CUSTOMER_NUMBER,
        Body: "Hello?",
        MessageSid: "SM3",
      }),
    );

    expect(leadUpdates).toHaveLength(0);
    expect(sentEvents).toHaveLength(0);
  });
});
