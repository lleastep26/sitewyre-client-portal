import { beforeEach, describe, expect, it, vi } from "vitest";

let fakeSupabase: unknown;
let fakeClient: {
  phone: string | null;
  forward_to_phone: string | null;
  business_name: string;
  ai_text_assistant_enabled?: boolean;
  a2p_status?: string;
};
let fakeContact: { id: string; name: string; ai_paused_at?: string | null };
let fakeLeads: { id: string; name: string; phone: string; lifecycle_status: string }[];
let leadUpdates: unknown[];
let sentEvents: unknown[];
let sentSms: { to: string; from: string; body: string }[];
let failAiQueue: boolean;

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => fakeSupabase,
}));
vi.mock("@/lib/crm/contacts", () => ({
  findOrCreateContact: async () => fakeContact,
}));
vi.mock("@/lib/inngest/client", () => ({
  inngest: {
    send: vi.fn((e: { name: string }) => {
      if (failAiQueue && e.name === "portal/ai-text.inbound") return Promise.reject(new Error("Inngest is down"));
      sentEvents.push(e);
      return Promise.resolve(undefined);
    }),
  },
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
  resolveOwnerAlertFrom: () => undefined,
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
    upsert() {
      return Promise.resolve({ error: null });
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
  failAiQueue = false;
  sentEvents = [];
  sentSms = [];
  fakeClient = { phone: OWNER_PHONE, forward_to_phone: null, business_name: "Test Co", a2p_status: "approved" };
  fakeContact = { id: "contact1", name: "A Customer" };
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

  it("hands the reply to the AI text assistant instead of alerting the owner when it's on", async () => {
    fakeClient.ai_text_assistant_enabled = true;
    fakeLeads = [{ id: "lead1", name: "Jo", phone: CUSTOMER_NUMBER, lifecycle_status: "new" }];
    const { POST } = await import("@/app/api/twilio/webhook/route");
    await POST(
      makeRequest({ To: CLIENT_NUMBER, From: CUSTOMER_NUMBER, Body: "Do you do drain cleaning?", MessageSid: "SM9" }),
    );

    expect(sentEvents).toContainEqual({
      name: "portal/ai-text.inbound",
      data: { clientId: "client1", contactId: "contact1", messageSid: "SM9" },
    });
    // Follow-ups are still cancelled.
    expect(sentEvents).toContainEqual(expect.objectContaining({ name: "portal/lead.replied" }));
    expect(sentSms).toHaveLength(0);
  });

  it("alerts the owner as before when the AI is paused on that thread", async () => {
    fakeClient.ai_text_assistant_enabled = true;
    fakeContact = { id: "contact1", name: "A Customer", ai_paused_at: "2026-11-13T10:00:00.000Z" };
    fakeLeads = [{ id: "lead1", name: "Jo", phone: CUSTOMER_NUMBER, lifecycle_status: "new" }];
    const { POST } = await import("@/app/api/twilio/webhook/route");
    await POST(
      makeRequest({ To: CLIENT_NUMBER, From: CUSTOMER_NUMBER, Body: "Any update?", MessageSid: "SM10" }),
    );

    expect(sentEvents).not.toContainEqual(expect.objectContaining({ name: "portal/ai-text.inbound" }));
    expect(sentSms).toContainEqual(expect.objectContaining({ to: OWNER_PHONE }));
  });

  it("never sends a STOP to the AI text assistant", async () => {
    fakeClient.ai_text_assistant_enabled = true;
    fakeLeads = [{ id: "lead1", name: "Jo", phone: CUSTOMER_NUMBER, lifecycle_status: "new" }];
    const { POST } = await import("@/app/api/twilio/webhook/route");
    await POST(makeRequest({ To: CLIENT_NUMBER, From: CUSTOMER_NUMBER, Body: "STOP", MessageSid: "SM11" }));

    expect(sentEvents).not.toContainEqual(expect.objectContaining({ name: "portal/ai-text.inbound" }));
  });

  it("falls back to alerting the owner if the AI job can't be queued", async () => {
    fakeClient.ai_text_assistant_enabled = true;
    failAiQueue = true;
    fakeLeads = [{ id: "lead1", name: "Jo", phone: CUSTOMER_NUMBER, lifecycle_status: "new" }];
    const { POST } = await import("@/app/api/twilio/webhook/route");
    await POST(makeRequest({ To: CLIENT_NUMBER, From: CUSTOMER_NUMBER, Body: "Hello?", MessageSid: "SM12" }));

    expect(sentSms).toContainEqual(
      expect.objectContaining({ to: OWNER_PHONE, body: expect.stringContaining("Jo replied") }),
    );
  });

  it("alerts the owner instead of queuing the AI when texting isn't A2P-approved", async () => {
    fakeClient.ai_text_assistant_enabled = true;
    fakeClient.a2p_status = "pending";
    fakeLeads = [{ id: "lead1", name: "Jo", phone: CUSTOMER_NUMBER, lifecycle_status: "new" }];
    const { POST } = await import("@/app/api/twilio/webhook/route");
    await POST(makeRequest({ To: CLIENT_NUMBER, From: CUSTOMER_NUMBER, Body: "Hello?", MessageSid: "SM13" }));

    expect(sentEvents).not.toContainEqual(expect.objectContaining({ name: "portal/ai-text.inbound" }));
    expect(sentSms).toContainEqual(expect.objectContaining({ to: OWNER_PHONE }));
  });
});
