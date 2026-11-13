import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sign } from "retell-sdk";

let fakeSupabase: unknown;
let clientRow: Record<string, unknown> | null;

const smsSend = vi.fn();
const createOutboundCall = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => fakeSupabase }));
vi.mock("@/lib/adapters", () => ({
  getSmsProvider: () => ({ send: smsSend }),
  getVoiceProvider: () => ({ createOutboundCall }),
}));
vi.mock("@/lib/a2p/sending", () => ({ resolveOwnerAlertFrom: () => undefined }));

function buildSupabase() {
  return {
    from(table: string) {
      if (table === "clients") {
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: clientRow }) }) }) };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
}

async function callRoute(body: unknown) {
  const raw = JSON.stringify(body);
  const signature = await sign(raw, "test-key");
  const { POST } = await import("@/app/api/retell/functions/flag-emergency/route");
  return POST(
    new Request("http://localhost/api/retell/functions/flag-emergency", {
      method: "POST",
      headers: { "x-retell-signature": signature },
      body: raw,
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("RETELL_API_KEY", "test-key");
  fakeSupabase = buildSupabase();
  smsSend.mockResolvedValue({ id: "sms1", status: "sent" });
  createOutboundCall.mockResolvedValue({ sid: "CAowner" });
  clientRow = {
    phone: "+15559990000",
    forward_to_phone: "+15558880000",
    twilio_phone_number: "+15557770000",
    business_name: "Acme",
  };
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("POST /api/retell/functions/flag-emergency", () => {
  it("sends one urgent SMS to the owner and places one extra call", async () => {
    const res = await callRoute({
      name: "flag_emergency",
      args: { summary: "Active flooding in the basement" },
      call: {
        call_id: "callX",
        agent_id: "a1",
        metadata: { client_id: "client1", twilio_call_sid: "CAcaller" },
      },
    });
    const json = await res.json();

    expect(smsSend).toHaveBeenCalledTimes(1);
    expect(smsSend.mock.calls[0][0].body).toContain("Active flooding in the basement");

    expect(createOutboundCall).toHaveBeenCalledTimes(1);
    const callArgs = createOutboundCall.mock.calls[0][0];
    expect(callArgs.to).toBe("+15558880000");
    // The owner's leg starts with the press-1 prompt, not the conference:
    // a voicemail that answers can never pull the caller off the AI.
    expect(callArgs.twiml).toContain("<Say>Emergency call for Acme, press 1 to accept.</Say>");
    expect(callArgs.twiml).toContain(
      "/api/retell/emergency-accept?originalCallSid=CAcaller&amp;conference=emergency-callX",
    );
    expect(callArgs.twiml).not.toContain("<Conference");
    expect(callArgs.twiml.indexOf("</Gather>")).toBeLessThan(callArgs.twiml.indexOf("<Hangup/>"));
    expect(callArgs.statusCallback).toBeUndefined();

    expect(json.transfer_attempted).toBe(true);
    expect(json.instructions).toContain("911");
  });

  it("still alerts the owner by SMS even if there's no original call sid to transfer", async () => {
    const res = await callRoute({
      name: "flag_emergency",
      args: { summary: "Gas smell" },
      call: { call_id: "callX", agent_id: "a1", metadata: { client_id: "client1" } },
    });
    const json = await res.json();
    expect(smsSend).toHaveBeenCalledTimes(1);
    expect(createOutboundCall).not.toHaveBeenCalled();
    expect(json.transfer_attempted).toBe(false);
  });

  it("errors when the client can't be identified", async () => {
    const res = await callRoute({
      name: "flag_emergency",
      args: { summary: "x" },
      call: { call_id: "callX", agent_id: "a1" },
    });
    const json = await res.json();
    expect(json.error).toContain("Unknown client");
    expect(smsSend).not.toHaveBeenCalled();
  });
});
