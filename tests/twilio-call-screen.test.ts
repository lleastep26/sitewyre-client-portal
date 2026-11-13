import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let clientRow: Record<string, unknown> | null;
let acceptedRows: unknown[];
let callsInserted: Array<Record<string, unknown>>;

const registerRetellPhoneCall = vi.fn();
const inngestSend = vi.fn();

function makeTable(table: string) {
  const chain = {
    select: () => chain,
    eq: () => chain,
    in: () => chain,
    order: () => chain,
    limit: async () => ({ data: table === "calls" ? acceptedRows : [] }),
    maybeSingle: async () => ({ data: table === "clients" ? clientRow : null }),
    insert(row: Record<string, unknown>) {
      if (table === "calls") callsInserted.push(row);
      return Promise.resolve({ error: null });
    },
  };
  return chain;
}

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ from: (table: string) => makeTable(table) }),
}));
vi.mock("@/lib/integrations/retell", () => ({
  registerRetellPhoneCall,
  retellSipUri: (callId: string) => `sip:${callId}@sip.retellai.com;transport=tcp`,
}));
vi.mock("@/lib/inngest/client", () => ({ inngest: { send: inngestSend } }));
vi.mock("@/lib/crm/contacts", () => ({ findOrCreateContact: async () => ({ id: "contact1" }) }));
vi.mock("@/lib/push/web-push", () => ({ sendPushToClient: vi.fn().mockResolvedValue(undefined) }));

function formRequest(path: string, fields: Record<string, string>) {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.set(k, v);
  return new Request(`http://localhost:3000${path}`, { method: "POST", body: form });
}

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
  vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "");
  vi.stubEnv("VERCEL_URL", "");
  vi.clearAllMocks();
  inngestSend.mockResolvedValue(undefined);
  acceptedRows = [];
  callsInserted = [];
  clientRow = {
    id: "client1",
    business_name: "Acme & Sons Plumbing",
    twilio_phone_number: "+15555550100",
    forward_to_phone: "+15550009999",
    dial_timeout_seconds: 15,
    ai_receptionist_enabled: false,
    retell_agent_id: null,
  };
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("forwarded call — press 1 to accept", () => {
  it("rings the owner with the prompt attached and keeps the caller on ringing", async () => {
    const { POST } = await import("@/app/api/twilio/voice/route");
    const res = await POST(
      formRequest("/api/twilio/voice", { To: "+15555550100", From: "+15559876543", CallSid: "CA123" }),
    );
    const body = await res.text();
    expect(body).toContain('answerOnBridge="true"');
    expect(body).toContain(
      '<Number url="http://localhost:3000/api/twilio/whisper?client=client1&amp;parent=CA123">+15550009999</Number>',
    );
    expect(body).toContain('action="http://localhost:3000/api/twilio/webhook"');
  });

  it("plays the business name and asks for 1, then hangs up the owner's leg if nothing is pressed", async () => {
    const { POST } = await import("@/app/api/twilio/whisper/route");
    const res = await POST(formRequest("/api/twilio/whisper?client=client1&parent=CA123", {}));
    const body = await res.text();
    expect(body).toContain("<Say>Call for Acme &amp; Sons Plumbing, press 1 to accept.</Say>");
    expect(body).toContain('<Gather numDigits="1" timeout="3"');
    expect(body).toContain(
      'action="http://localhost:3000/api/twilio/whisper/accept?client=client1&amp;parent=CA123"',
    );
    // Falls through to a hangup when no digit arrives (voicemail, no input).
    expect(body.indexOf("</Gather>")).toBeLessThan(body.indexOf("<Hangup/>"));
  });

  it("hangs up the owner's leg when the whisper has no client to name", async () => {
    clientRow = null;
    const { POST } = await import("@/app/api/twilio/whisper/route");
    const res = await POST(formRequest("/api/twilio/whisper?client=nope&parent=CA123", {}));
    expect(await res.text()).toBe("<Response><Hangup/></Response>");
  });

  it("connects the caller and records the call as accepted when 1 is pressed", async () => {
    const { POST } = await import("@/app/api/twilio/whisper/accept/route");
    const res = await POST(
      formRequest("/api/twilio/whisper/accept?client=client1&parent=CA123", { Digits: "1" }),
    );
    const body = await res.text();
    expect(body).not.toContain("<Hangup/>");
    expect(callsInserted).toEqual([
      { client_id: "client1", direction: "inbound", missed: false, twilio_call_sid: "CA123" },
    ]);
  });

  it("drops the owner's leg on any other digit and records nothing", async () => {
    const { POST } = await import("@/app/api/twilio/whisper/accept/route");
    const res = await POST(
      formRequest("/api/twilio/whisper/accept?client=client1&parent=CA123", { Digits: "5" }),
    );
    expect(await res.text()).toBe("<Response><Hangup/></Response>");
    expect(callsInserted).toHaveLength(0);
  });
});

describe("Dial callback after the owner's phone was answered", () => {
  const callback = {
    To: "+15555550100",
    From: "+15559876543",
    CallSid: "CA123",
    CallStatus: "in-progress",
    DialCallStatus: "completed",
  };

  it("treats a voicemail pickup (nobody pressed 1) as unanswered and hands the caller to the AI", async () => {
    clientRow = { ...clientRow, ai_receptionist_enabled: true, retell_agent_id: "agent1" };
    registerRetellPhoneCall.mockResolvedValue({ callId: "call_xyz" });
    const { POST } = await import("@/app/api/twilio/webhook/route");
    const res = await POST(formRequest("/api/twilio/webhook", callback));
    const body = await res.text();

    expect(body).toContain("<Sip>sip:call_xyz@sip.retellai.com;transport=tcp</Sip>");
    expect(callsInserted).toHaveLength(1);
    expect(callsInserted[0]).toMatchObject({ missed: true, twilio_call_sid: "CA123" });
    expect(inngestSend).toHaveBeenCalledWith(
      expect.objectContaining({ name: "portal/call.missed" }),
    );
  });

  it("logs a missed call (for the text-back) when the AI receptionist is off", async () => {
    const { POST } = await import("@/app/api/twilio/webhook/route");
    const res = await POST(formRequest("/api/twilio/webhook", callback));

    expect(await res.text()).toBe("<Response></Response>");
    expect(callsInserted[0]).toMatchObject({ missed: true, twilio_call_sid: "CA123" });
    expect(registerRetellPhoneCall).not.toHaveBeenCalled();
  });

  it("does nothing more when the owner pressed 1 and took the call", async () => {
    clientRow = { ...clientRow, ai_receptionist_enabled: true, retell_agent_id: "agent1" };
    acceptedRows = [{ id: "call-row" }];
    const { POST } = await import("@/app/api/twilio/webhook/route");
    const res = await POST(formRequest("/api/twilio/webhook", callback));

    expect(await res.text()).toBe("<Response></Response>");
    expect(callsInserted).toHaveLength(0);
    expect(inngestSend).not.toHaveBeenCalled();
    expect(registerRetellPhoneCall).not.toHaveBeenCalled();
  });
});
