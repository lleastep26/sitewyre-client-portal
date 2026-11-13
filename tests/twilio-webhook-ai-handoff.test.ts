import { beforeEach, describe, expect, it, vi } from "vitest";

let fakeSupabase: unknown;
let clientRow: Record<string, unknown>;
let callsInserted: unknown[];

const registerRetellPhoneCall = vi.fn();
const inngestSend = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => fakeSupabase }));
vi.mock("@/lib/integrations/retell", () => ({
  registerRetellPhoneCall,
  retellSipUri: (callId: string) => `sip:${callId}@sip.retellai.com;transport=tcp`,
}));
vi.mock("@/lib/inngest/client", () => ({ inngest: { send: inngestSend } }));
vi.mock("@/lib/crm/contacts", () => ({ findOrCreateContact: async () => ({ id: "contact1" }) }));
vi.mock("@/lib/push/web-push", () => ({ sendPushToClient: vi.fn().mockResolvedValue(undefined) }));

function makeTable(singleResponse: { data: unknown } = { data: null }) {
  const chain = {
    select() {
      return chain;
    },
    eq() {
      return chain;
    },
    in() {
      return chain;
    },
    order() {
      return chain;
    },
    maybeSingle: async () => singleResponse,
    insert(row: unknown) {
      callsInserted.push(row);
      return Promise.resolve({ error: null });
    },
  };
  return chain;
}

function buildSupabase() {
  return {
    from(table: string) {
      if (table === "clients") return makeTable({ data: clientRow });
      return makeTable();
    },
  };
}

function formRequest(fields: Record<string, string>) {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.set(k, v);
  return new Request("http://localhost:3000/api/twilio/webhook", { method: "POST", body: form });
}

beforeEach(() => {
  vi.clearAllMocks();
  callsInserted = [];
  inngestSend.mockResolvedValue(undefined);
  clientRow = {
    id: "client1",
    business_name: "Acme",
    twilio_phone_number: "+15555550100",
    ai_receptionist_enabled: true,
    retell_agent_id: "agent1",
  };
  fakeSupabase = buildSupabase();
});

describe("Twilio webhook — AI receptionist handoff on no-answer", () => {
  it("hands the live call to Retell when the owner doesn't answer and the receptionist is on", async () => {
    registerRetellPhoneCall.mockResolvedValue({ callId: "call_xyz" });
    const { POST } = await import("@/app/api/twilio/webhook/route");
    const res = await POST(
      formRequest({
        To: "+15555550100",
        From: "+15551234567",
        CallSid: "CA1",
        CallStatus: "completed",
        DialCallStatus: "no-answer",
      }),
    );
    const body = await res.text();
    expect(body).toContain("<Sip>sip:call_xyz@sip.retellai.com;transport=tcp</Sip>");
    expect(body).toContain('action="http://localhost:3000/api/retell/dial-status"');
    expect(callsInserted).toHaveLength(1);
    expect(inngestSend).toHaveBeenCalledWith(
      expect.objectContaining({ name: "portal/call.missed", data: expect.objectContaining({ callSid: "CA1" }) }),
    );
  });

  it("falls back to the normal empty response when the receptionist is off", async () => {
    clientRow = { ...clientRow, ai_receptionist_enabled: false };
    const { POST } = await import("@/app/api/twilio/webhook/route");
    const res = await POST(
      formRequest({
        To: "+15555550100",
        From: "+15551234567",
        CallSid: "CA1",
        CallStatus: "completed",
        DialCallStatus: "no-answer",
      }),
    );
    const body = await res.text();
    expect(body).toBe("<Response></Response>");
    expect(registerRetellPhoneCall).not.toHaveBeenCalled();
    expect(callsInserted).toHaveLength(1);
  });

  it("falls back to the normal empty response when the Retell handoff itself fails", async () => {
    registerRetellPhoneCall.mockRejectedValue(new Error("Retell is down"));
    const { POST } = await import("@/app/api/twilio/webhook/route");
    const res = await POST(
      formRequest({
        To: "+15555550100",
        From: "+15551234567",
        CallSid: "CA1",
        CallStatus: "completed",
        DialCallStatus: "no-answer",
      }),
    );
    const body = await res.text();
    expect(body).toBe("<Response></Response>");
  });
});
