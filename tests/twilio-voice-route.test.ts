import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let fakeSupabase: unknown;
let availabilityRows: unknown[];
let callsInserted: unknown[];

const registerRetellPhoneCall = vi.fn();
const inngestSend = vi.fn();
const hasOtherLiveCall = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => fakeSupabase,
}));
vi.mock("@/lib/integrations/retell", () => ({
  registerRetellPhoneCall,
  retellSipUri: (callId: string) => `sip:${callId}@sip.retellai.com;transport=tcp`,
}));
vi.mock("@/lib/inngest/client", () => ({ inngest: { send: inngestSend } }));
vi.mock("@/lib/adapters", () => ({ getVoiceProvider: () => ({ hasOtherLiveCall }) }));

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
  vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "");
  vi.stubEnv("VERCEL_URL", "");
  vi.clearAllMocks();
  availabilityRows = [];
  callsInserted = [];
  inngestSend.mockResolvedValue(undefined);
  hasOtherLiveCall.mockResolvedValue(false);
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
    expect(body).toContain(">+15550009999</Number>");
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
    expect(body).toContain(">+15550009999</Number>");
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
    expect(body).toContain(">+15550009999</Number>");
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
  describe("forwarded calls", () => {
    // In business hours, so an ordinary call would ring the owner.
    const openNow = () => {
      availabilityRows = [
        { weekday: new Date().getUTCDay(), start_time: "00:00", end_time: "24:00", buffer_minutes: 0, min_notice_hours: 0 },
      ];
    };
    const aiClient = {
      id: "client1",
      phone: "+15550009999",
      forward_to_phone: "+15550009999",
      business_line_phone: "+15550008888",
      call_forwarding_enabled: true,
      dial_timeout_seconds: 15,
      ai_receptionist_enabled: true,
      retell_agent_id: "agent1",
      timezone: "UTC",
    };
    const call = { To: "+15551234567", From: "+15559876543", CallSid: "CA1" };

    it("sends every call straight to the AI when the client's forwarding setting is on, without ringing the owner", async () => {
      openNow();
      registerRetellPhoneCall.mockResolvedValue({ callId: "call_fwd" });
      fakeSupabase = buildSupabase(aiClient);
      const { POST } = await import("@/app/api/twilio/voice/route");
      const body = await (await POST(formRequest(call))).text();

      expect(body).toContain("<Sip>sip:call_fwd@sip.retellai.com;transport=tcp</Sip>");
      expect(body).not.toContain("<Number");
      expect(registerRetellPhoneCall).toHaveBeenCalledWith(
        expect.objectContaining({
          fromNumber: "+15559876543",
          callerNumber: "+15559876543",
          metadata: expect.objectContaining({ caller_number: "+15559876543" }),
        }),
      );
      expect(callsInserted).toEqual([
        expect.objectContaining({ missed: true, forwarded_from: "+15550008888" }),
      ]);
      // No live-call lookup is needed: nothing rings the owner in this mode.
      expect(hasOtherLiveCall).not.toHaveBeenCalled();
    });

    it("detects a forwarded call by ForwardedFrom when the setting is off", async () => {
      openNow();
      registerRetellPhoneCall.mockResolvedValue({ callId: "call_fwd" });
      fakeSupabase = buildSupabase({ ...aiClient, call_forwarding_enabled: false });
      const { POST } = await import("@/app/api/twilio/voice/route");
      const body = await (
        await POST(formRequest({ ...call, ForwardedFrom: "+15550009999" }))
      ).text();

      expect(body).toContain("<Sip>sip:call_fwd@");
      expect(body).not.toContain("<Number");
      expect(callsInserted).toEqual([expect.objectContaining({ forwarded_from: "+15550009999" })]);
    });

    it("rejects our own ring to the owner when it comes back with ForwardedFrom, instead of starting a second AI call", async () => {
      openNow();
      hasOtherLiveCall.mockResolvedValue(true);
      fakeSupabase = buildSupabase({ ...aiClient, call_forwarding_enabled: false });
      const { POST } = await import("@/app/api/twilio/voice/route");
      const body = await (
        await POST(formRequest({ ...call, CallSid: "CA2", ForwardedFrom: "+15550009999" }))
      ).text();

      expect(body).toBe('<Response><Reject reason="busy"/></Response>');
      expect(hasOtherLiveCall).toHaveBeenCalledWith({
        from: "+15559876543",
        to: "+15551234567",
        excludeCallSid: "CA2",
      });
      expect(registerRetellPhoneCall).not.toHaveBeenCalled();
      expect(callsInserted).toHaveLength(0);
    });

    it("rejects a looped ring even when the carrier sends no ForwardedFrom", async () => {
      openNow();
      hasOtherLiveCall.mockResolvedValue(true);
      fakeSupabase = buildSupabase({ ...aiClient, call_forwarding_enabled: false });
      const { POST } = await import("@/app/api/twilio/voice/route");
      const body = await (await POST(formRequest({ ...call, CallSid: "CA2" }))).text();
      expect(body).toBe('<Response><Reject reason="busy"/></Response>');
    });

    it("rings the owner as usual when the caller has no other live call, even if the lookup fails", async () => {
      openNow();
      hasOtherLiveCall.mockRejectedValue(new Error("Twilio is down"));
      fakeSupabase = buildSupabase({ ...aiClient, call_forwarding_enabled: false });
      const { POST } = await import("@/app/api/twilio/voice/route");
      const body = await (await POST(formRequest(call))).text();
      expect(body).toContain(">+15550009999</Number>");
    });

    it("rejects the emergency ring when the owner's forwarding sends it back", async () => {
      fakeSupabase = buildSupabase(aiClient);
      const { POST } = await import("@/app/api/twilio/voice/route");
      const body = await (
        await POST(formRequest({ To: "+15551234567", From: "+15551234567", CallSid: "CA3" }))
      ).text();
      expect(body).toBe('<Response><Reject reason="busy"/></Response>');
      expect(registerRetellPhoneCall).not.toHaveBeenCalled();
    });

    it("falls back to the missed-call text when the AI handoff fails", async () => {
      registerRetellPhoneCall.mockRejectedValue(new Error("Retell is down"));
      fakeSupabase = buildSupabase(aiClient);
      const { POST } = await import("@/app/api/twilio/voice/route");
      const body = await (await POST(formRequest(call))).text();

      expect(body).toBe("<Response></Response>");
      expect(callsInserted).toEqual([expect.objectContaining({ missed: true })]);
      expect(inngestSend).toHaveBeenCalledWith({
        name: "portal/call.missed",
        data: { clientId: "client1", from: "+15559876543", callSid: "CA1" },
      });
    });

    it("records a missed call, and never rings the owner, when the AI receptionist is off", async () => {
      openNow();
      fakeSupabase = buildSupabase({ ...aiClient, ai_receptionist_enabled: false, retell_agent_id: null });
      const { POST } = await import("@/app/api/twilio/voice/route");
      const body = await (await POST(formRequest(call))).text();

      expect(body).toBe("<Response></Response>");
      expect(callsInserted).toEqual([
        expect.objectContaining({ missed: true, forwarded_from: "+15550008888" }),
      ]);
      expect(inngestSend).toHaveBeenCalledWith(expect.objectContaining({ name: "portal/call.missed" }));
    });

    it("tells the agent the number is unknown when caller ID is the business's own line", async () => {
      registerRetellPhoneCall.mockResolvedValue({ callId: "call_fwd" });
      fakeSupabase = buildSupabase(aiClient);
      const { POST } = await import("@/app/api/twilio/voice/route");
      await POST(formRequest({ ...call, From: "+15550008888" }));

      expect(registerRetellPhoneCall).toHaveBeenCalledWith(
        expect.objectContaining({
          callerNumber: "",
          metadata: expect.objectContaining({ caller_number: "" }),
        }),
      );
      // Nobody to text back: the "caller" is the owner's own number.
      expect(inngestSend).not.toHaveBeenCalled();
    });
  });
});
