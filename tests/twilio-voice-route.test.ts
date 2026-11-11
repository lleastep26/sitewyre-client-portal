import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let fakeSupabase: unknown;

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => fakeSupabase,
}));

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
  vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "");
  vi.stubEnv("VERCEL_URL", "");
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
    from() {
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
});
