import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sign } from "retell-sdk";

let fakeSupabase: unknown;
let clientRow: Record<string, unknown> | null;
let clientUpdates: Record<string, unknown>[];
let callUpdates: { callSid: string; patch: unknown }[];

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => fakeSupabase }));

function buildSupabase() {
  return {
    from(table: string) {
      if (table === "clients") {
        return {
          select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: clientRow }) }) }),
          update: (patch: Record<string, unknown>) => ({
            eq: async () => {
              clientUpdates.push(patch);
              return { error: null };
            },
          }),
        };
      }
      if (table === "calls") {
        return {
          update: (patch: unknown) => ({
            eq: async (_col: string, value: string) => {
              callUpdates.push({ callSid: value, patch });
              return { error: null };
            },
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
}

async function callRoute(body: unknown) {
  const raw = JSON.stringify(body);
  const signature = await sign(raw, "test-key");
  const { POST } = await import("@/app/api/retell/webhook/route");
  return POST(
    new Request("http://localhost/api/retell/webhook", {
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
  clientUpdates = [];
  callUpdates = [];
  clientRow = { retell_minutes_used_this_month: 10 };
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("POST /api/retell/webhook", () => {
  it("marks the call ai_handled as soon as the AI call starts", async () => {
    await callRoute({
      event: "call_started",
      call: { call_id: "c1", metadata: { client_id: "client1", twilio_call_sid: "CAcaller" } },
    });
    expect(callUpdates).toEqual([{ callSid: "CAcaller", patch: { ai_handled: true } }]);
    expect(clientUpdates).toHaveLength(0);
  });

  it("adds the call duration in minutes to the running monthly total on call_ended", async () => {
    await callRoute({
      event: "call_ended",
      call: {
        call_id: "c1",
        start_timestamp: 1_000_000,
        end_timestamp: 1_000_000 + 90_000, // 1.5 minutes
        metadata: { client_id: "client1" },
      },
    });
    expect(clientUpdates).toEqual([{ retell_minutes_used_this_month: 11.5 }]);
  });

  it("ignores other events", async () => {
    await callRoute({
      event: "call_analyzed",
      call: { call_id: "c1", metadata: { client_id: "client1", twilio_call_sid: "CAcaller" } },
    });
    expect(clientUpdates).toHaveLength(0);
    expect(callUpdates).toHaveLength(0);
  });

  it("ignores a call_ended with no client_id in metadata", async () => {
    await callRoute({
      event: "call_ended",
      call: { call_id: "c1", start_timestamp: 1, end_timestamp: 60_001 },
    });
    expect(clientUpdates).toHaveLength(0);
  });

  it("rejects a bad signature", async () => {
    const raw = JSON.stringify({ event: "call_ended", call: { call_id: "c1" } });
    const { POST } = await import("@/app/api/retell/webhook/route");
    const res = await POST(
      new Request("http://localhost/api/retell/webhook", {
        method: "POST",
        headers: { "x-retell-signature": "v=1,d=bogus" },
        body: raw,
      }),
    );
    expect(res.status).toBe(401);
  });
});
