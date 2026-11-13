import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let fakeSupabase: unknown;
let availabilityRows: unknown[];
let callsInserted: unknown[];

const registerRetellPhoneCall = vi.fn();
const inngestSend = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => fakeSupabase,
}));
vi.mock("@/lib/integrations/retell", () => ({
  registerRetellPhoneCall,
  retellSipUri: (callId: string) => `sip:${callId}@sip.retellai.com;transport=tcp`,
}));
vi.mock("@/lib/inngest/client", () => ({ inngest: { send: inngestSend } }));

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
  vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "");
  vi.stubEnv("VERCEL_URL", "");
  vi.clearAllMocks();
  availabilityRows = [];
  callsInserted = [];
  inngestSend.mockResolvedValue(undefined);
});
afterEach(() => {
  vi.unstubAllEnvs();
});

function makeTable(singleResponse: { data: unknown }) {
  const chain = {
    select() {
      return chain;
    },
    eq() {
      return chain;
    },
    maybeSingle: async () => singleResponse,
  };
  return chain;
}

function buildSupabase(clientRow: unknown) {
  return {
    from(table: string) {
      if (table === "availability") {
        return { select: () => ({ eq: () => ({ data: availabilityRows }) }) };
      }
      if (table === "calls") {
        return { insert: (row: unknown) => Promise.resolve((callsInserted.push(row), { error: null })) };
      }
      return makeTable({ data: clientRow });
    },
  };
}

function formRequest(fields: Record<string, string>) {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.set(k, v);
  return new Request("http://localhost/api/twilio/voice", {
    method: "POST",
    body: form,
  });
}

describe("POST /api/twilio/voice", () => {
  it("dials forward_to_phone with the client's configured timeout and an action callback to the SMS webhook", async () => {
    fakeSupabase = buildSupabase({
      forward_to_phone: "+15550009999",
      dial_timeout_seconds: 15,
    });
    const { POST } = await import("@/app/api/twilio/voice/route");
    const res = await POST(
      formRequest({ To: "+15551234567", From: "+15559876543", CallSid: "CA123" }),
    );
    const body = await res.text();
    expect(body).toContain('<Dial timeout="15"');
    expect(body).toContain("<Number>+15550009999</Number>");
    expect(body).toContain('action="http://localhost:3000/api/twilio/webhook"');
  });

  it("uses the client's own dial_timeout_seconds when it differs from the default", async () => {
    fakeSupabase = buildSupabase({
      forward_to_phone: "+15550009999",
      dial_timeout_seconds: 25,
    });
    const { POST } = await import("@/app/api/twilio/voice/route");
    const res = await POST(formRequest({ To: "+15551234567" }));
    const body = await res.text();
    expect(body).toContain('<Dial timeout="25"');
  });

  it("returns an empty response when the number has no forward_to_phone set", async () => {
    fakeSupabase = buildSupabase({ forward_to_phone: null, dial_timeout_seconds: 15 });
    const { POST } = await import("@/app/api/twilio/voice/route");
    const res = await POST(formRequest({ To: "+15551234567" }));
    const body = await res.text();
    expect(body).toBe("<Response></Response>");
  });

  it("returns an empty response when the number doesn't match any client", async () => {
    fakeSupabase = buildSupabase(null);
    const { POST } = await import("@/app/api/twilio/voice/route");
    const res = await POST(formRequest({ To: "+15551234567" }));
    const body = await res.text();
    expect(body).toBe("<Response></Response>");
  });

  it("still dials the owner in business hours even with the AI receptionist on", async () => {
    availabilityRows = [
      { weekday: new Date().getUTCDay(), start_time: "00:00", end_time: "24:00", buffer_minutes: 0, min_notice_hours: 0 },
    ];
    fakeSupabase = buildSupabase({
      id: "client1",
      forward_to_phone: "+15550009999",
      dial_timeout_seconds: 15,
      ai_receptionist_enabled: true,
      retell_agent_id: "agent1",
      timezone: "UTC",
    });
    const { POST } = await import("@/app/api/twilio/voice/route");
    const res = await POST(formRequest({ To: "+15551234567", From: "+15559876543", CallSid: "CA1" }));
    const body = await res.text();
    expect(body).toContain("<Number>+15550009999</Number>");
    expect(registerRetellPhoneCall).not.toHaveBeenCalled();
  });

  it("hands off straight to Retell after hours when the AI receptionist is on", async () => {
    availabilityRows = []; // no window open right now => after hours
    registerRetellPhoneCall.mockResolvedValue({ callId: "call_xyz" });
    fakeSupabase = buildSupabase({
      id: "client1",
      forward_to_phone: "+15550009999",
      dial_timeout_seconds: 15,
      ai_receptionist_enabled: true,
      retell_agent_id: "agent1",
      timezone: "UTC",
    });
    const { POST } = await import("@/app/api/twilio/voice/route");
    const res = await POST(formRequest({ To: "+15551234567", From: "+15559876543", CallSid: "CA1" }));
    const body = await res.text();
    expect(body).toContain("<Sip>sip:call_xyz@sip.retellai.com;transport=tcp</Sip>");
    expect(body).not.toContain("<Number>");
    expect(registerRetellPhoneCall).toHaveBeenCalledWith(
      expect.objectContaining({ agentId: "agent1" }),
    );
    expect(callsInserted).toHaveLength(1);
    expect(inngestSend).toHaveBeenCalledWith(
      expect.objectContaining({ name: "portal/call.missed" }),
    );
  });

  it("falls back to ringing the owner's number logic unaffected when the receptionist is off", async () => {
    availabilityRows = [];
    fakeSupabase = buildSupabase({
      id: "client1",
      forward_to_phone: "+15550009999",
      dial_timeout_seconds: 15,
      ai_receptionist_enabled: false,
      retell_agent_id: null,
      timezone: "UTC",
    });
    const { POST } = await import("@/app/api/twilio/voice/route");
    const res = await POST(formRequest({ To: "+15551234567", From: "+15559876543", CallSid: "CA1" }));
    const body = await res.text();
    expect(body).toContain("<Number>+15550009999</Number>");
    expect(registerRetellPhoneCall).not.toHaveBeenCalled();
  });

  it("hangs up cleanly if the Retell registration itself fails after hours", async () => {
    availabilityRows = [];
    registerRetellPhoneCall.mockRejectedValue(new Error("Retell is down"));
    fakeSupabase = buildSupabase({
      id: "client1",
      forward_to_phone: "+15550009999",
      dial_timeout_seconds: 15,
      ai_receptionist_enabled: true,
      retell_agent_id: "agent1",
      timezone: "UTC",
    });
    const { POST } = await import("@/app/api/twilio/voice/route");
    const res = await POST(formRequest({ To: "+15551234567", From: "+15559876543", CallSid: "CA1" }));
    const body = await res.text();
    expect(body).toBe("<Response></Response>");
  });
});
