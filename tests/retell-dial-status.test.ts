import { beforeEach, describe, expect, it, vi } from "vitest";

let fakeSupabase: unknown;
let updated: { callSid: string; patch: unknown }[];

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => fakeSupabase }));

function buildSupabase() {
  return {
    from(table: string) {
      if (table !== "calls") throw new Error(`unexpected table ${table}`);
      return {
        update: (patch: unknown) => ({
          eq: async (_col: string, value: string) => {
            updated.push({ callSid: value, patch });
            return { error: null };
          },
        }),
      };
    },
  };
}

function formRequest(fields: Record<string, string>) {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.set(k, v);
  return new Request("http://localhost/api/retell/dial-status", { method: "POST", body: form });
}

beforeEach(() => {
  vi.clearAllMocks();
  fakeSupabase = buildSupabase();
  updated = [];
});

describe("POST /api/retell/dial-status", () => {
  it("marks the call ai_handled when the SIP leg to Retell completed", async () => {
    const { POST } = await import("@/app/api/retell/dial-status/route");
    await POST(formRequest({ CallSid: "CAcaller", DialCallStatus: "completed" }));
    expect(updated).toEqual([{ callSid: "CAcaller", patch: { ai_handled: true } }]);
  });

  it("does nothing when the handoff never connected", async () => {
    const { POST } = await import("@/app/api/retell/dial-status/route");
    await POST(formRequest({ CallSid: "CAcaller", DialCallStatus: "no-answer" }));
    expect(updated).toHaveLength(0);
  });
});
