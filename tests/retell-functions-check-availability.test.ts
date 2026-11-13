import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sign } from "retell-sdk";

let fakeSupabase: unknown;
const findOpenSlots = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => fakeSupabase }));
vi.mock("@/lib/scheduling/service-slots", () => ({ findOpenSlots }));

function makeTable(rows: Record<string, unknown>) {
  const chain = {
    select() {
      return chain;
    },
    eq() {
      return chain;
    },
    ilike() {
      return chain;
    },
    maybeSingle: async () => ({ data: rows }),
  };
  return chain;
}

function buildSupabase(clientRow: unknown, serviceRow: unknown) {
  return {
    from(table: string) {
      if (table === "clients") return makeTable(clientRow as Record<string, unknown>);
      if (table === "services") return makeTable(serviceRow as Record<string, unknown>);
      throw new Error(`unexpected table ${table}`);
    },
  };
}

async function callRoute(body: unknown, apiKey = "test-key") {
  const raw = JSON.stringify(body);
  const signature = await sign(raw, apiKey);
  const { POST } = await import("@/app/api/retell/functions/check-availability/route");
  return POST(
    new Request("http://localhost/api/retell/functions/check-availability", {
      method: "POST",
      headers: { "x-retell-signature": signature },
      body: raw,
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("RETELL_API_KEY", "test-key");
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("POST /api/retell/functions/check-availability", () => {
  it("rejects a request with a bad signature", async () => {
    const raw = JSON.stringify({ name: "check_availability", args: {}, call: { call_id: "c1", agent_id: "a1" } });
    const { POST } = await import("@/app/api/retell/functions/check-availability/route");
    const res = await POST(
      new Request("http://localhost/api/retell/functions/check-availability", {
        method: "POST",
        headers: { "x-retell-signature": "v=1,d=bogus" },
        body: raw,
      }),
    );
    expect(res.status).toBe(401);
  });

  it("errors when the call has no client_id in metadata", async () => {
    const res = await callRoute({
      name: "check_availability",
      args: { service_name: "Drain cleaning" },
      call: { call_id: "c1", agent_id: "a1" },
    });
    const json = await res.json();
    expect(json.error).toContain("Unknown client");
  });

  it("returns available times for a matching service", async () => {
    fakeSupabase = buildSupabase(
      { id: "client1", timezone: "America/Chicago" },
      { id: "svc1", name: "Drain Cleaning", duration_minutes: 60 },
    );
    findOpenSlots.mockResolvedValue([new Date("2026-11-16T15:00:00.000Z")]);

    const res = await callRoute({
      name: "check_availability",
      args: { service_name: "drain" },
      call: { call_id: "c1", agent_id: "a1", metadata: { client_id: "client1" } },
    });
    const json = await res.json();
    expect(json.service).toBe("Drain Cleaning");
    expect(json.available_times).toEqual(["2026-11-16T15:00:00.000Z"]);
  });

  it("errors when no bookable service matches", async () => {
    fakeSupabase = buildSupabase({ id: "client1", timezone: "America/Chicago" }, null);
    const res = await callRoute({
      name: "check_availability",
      args: { service_name: "spaceship repair" },
      call: { call_id: "c1", agent_id: "a1", metadata: { client_id: "client1" } },
    });
    const json = await res.json();
    expect(json.error).toContain("No bookable service");
  });
});
