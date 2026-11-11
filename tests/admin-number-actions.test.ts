import { beforeEach, describe, expect, it, vi } from "vitest";

let fakeSupabase: unknown;
let fakeClientRow: {
  id: string;
  twilio_phone_number: string | null;
  forward_to_phone: string | null;
};

const searchLocalNumber = vi.fn();
const getLocalNumberMonthlyPrice = vi.fn();
const buyNumber = vi.fn();
const assignNumberWebhooks = vi.fn();

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/adapters", () => ({
  getSmsProvider: () => ({
    searchLocalNumber,
    getLocalNumberMonthlyPrice,
    buyNumber,
    assignNumberWebhooks,
  }),
}));
vi.mock("@/lib/auth/session", () => ({
  requireAdmin: async () => ({ supabase: fakeSupabase, user: { id: "admin1" } }),
  ADMIN_VIEW_COOKIE: "admin_view_client_id",
}));

type TableOpts = {
  onUpdate?: (patch: unknown) => void;
  onInsert?: (row: unknown) => void;
};

function makeClientsTable(opts: TableOpts = {}) {
  const chain = {
    select() {
      return chain;
    },
    eq() {
      return chain;
    },
    update(patch: unknown) {
      opts.onUpdate?.(patch);
      return chain;
    },
    maybeSingle: async () => ({ data: fakeClientRow }),
    then(resolve: (v: { error: null }) => void) {
      resolve({ error: null });
    },
  };
  return chain;
}

function buildSupabase(opts: TableOpts & { auditInsert?: (row: unknown) => void }) {
  return {
    from(table: string) {
      if (table === "clients") return makeClientsTable(opts);
      if (table === "audit_log") {
        return {
          insert: async (row: unknown) => {
            opts.auditInsert?.(row);
            return { error: null };
          },
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://portal.example.com");
  fakeClientRow = {
    id: "client1",
    twilio_phone_number: null,
    forward_to_phone: "+15550009999",
  };
});

function fd(fields: Record<string, string>) {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.set(k, v);
  return form;
}

describe("previewClientNumber", () => {
  it("rejects a malformed area code", async () => {
    fakeSupabase = buildSupabase({});
    const { previewClientNumber } = await import("@/app/admin/actions");
    const result = await previewClientNumber(fd({ clientId: "client1", areaCode: "5" }));
    expect(result.error).toMatch(/area code/i);
    expect(searchLocalNumber).not.toHaveBeenCalled();
  });

  it("blocks when the client already has a Twilio number", async () => {
    fakeClientRow.twilio_phone_number = "+15125550100";
    fakeSupabase = buildSupabase({});
    const { previewClientNumber } = await import("@/app/admin/actions");
    const result = await previewClientNumber(fd({ clientId: "client1", areaCode: "512" }));
    expect(result.error).toMatch(/already has/i);
    expect(searchLocalNumber).not.toHaveBeenCalled();
  });

  it("blocks when forward_to_phone isn't set", async () => {
    fakeClientRow.forward_to_phone = null;
    fakeSupabase = buildSupabase({});
    const { previewClientNumber } = await import("@/app/admin/actions");
    const result = await previewClientNumber(fd({ clientId: "client1", areaCode: "512" }));
    expect(result.error).toMatch(/forward-to phone/i);
    expect(searchLocalNumber).not.toHaveBeenCalled();
  });

  it("returns the found number and price when nothing blocks it", async () => {
    searchLocalNumber.mockResolvedValue("+15125550123");
    getLocalNumberMonthlyPrice.mockResolvedValue("1.15");
    fakeSupabase = buildSupabase({});
    const { previewClientNumber } = await import("@/app/admin/actions");
    const result = await previewClientNumber(fd({ clientId: "client1", areaCode: "512" }));
    expect(result).toEqual({ phoneNumber: "+15125550123", monthlyPrice: "1.15" });
  });

  it("returns an error when no numbers are available for that area code", async () => {
    searchLocalNumber.mockResolvedValue(null);
    getLocalNumberMonthlyPrice.mockResolvedValue("1.15");
    fakeSupabase = buildSupabase({});
    const { previewClientNumber } = await import("@/app/admin/actions");
    const result = await previewClientNumber(fd({ clientId: "client1", areaCode: "512" }));
    expect(result.error).toMatch(/no numbers available/i);
  });
});

describe("buyClientNumber", () => {
  it("blocks when the client already has a number (race re-check)", async () => {
    fakeClientRow.twilio_phone_number = "+15125550100";
    fakeSupabase = buildSupabase({});
    const { buyClientNumber } = await import("@/app/admin/actions");
    const result = await buyClientNumber(
      fd({ clientId: "client1", phoneNumber: "+15125550123" }),
    );
    expect(result.error).toMatch(/already has/i);
    expect(buyNumber).not.toHaveBeenCalled();
  });

  it("blocks when forward_to_phone isn't set", async () => {
    fakeClientRow.forward_to_phone = null;
    fakeSupabase = buildSupabase({});
    const { buyClientNumber } = await import("@/app/admin/actions");
    const result = await buyClientNumber(
      fd({ clientId: "client1", phoneNumber: "+15125550123" }),
    );
    expect(result.error).toMatch(/forward-to phone/i);
    expect(buyNumber).not.toHaveBeenCalled();
  });

  it("buys the exact number passed in and only configures that number's webhooks", async () => {
    buyNumber.mockResolvedValue({ phoneNumber: "+15125550123", sid: "PNabc" });
    const updates: unknown[] = [];
    const auditRows: unknown[] = [];
    fakeSupabase = buildSupabase({
      onUpdate: (patch) => updates.push(patch),
      auditInsert: (row) => auditRows.push(row),
    });
    const { buyClientNumber } = await import("@/app/admin/actions");
    const result = await buyClientNumber(
      fd({ clientId: "client1", phoneNumber: "+15125550123" }),
    );

    expect(buyNumber).toHaveBeenCalledWith("+15125550123");
    expect(assignNumberWebhooks).toHaveBeenCalledWith("PNabc", {
      smsUrl: "https://portal.example.com/api/twilio/webhook",
      voiceUrl: "https://portal.example.com/api/twilio/voice",
    });
    expect(updates).toContainEqual({
      twilio_phone_number: "+15125550123",
      twilio_phone_sid: "PNabc",
    });
    expect(auditRows).toHaveLength(1);
    expect(result).toEqual({ ok: true, phoneNumber: "+15125550123" });
  });
});

describe("setClientCallRouting", () => {
  it("rejects a dial timeout outside 5-60 seconds", async () => {
    fakeSupabase = buildSupabase({});
    const { setClientCallRouting } = await import("@/app/admin/actions");
    const result = await setClientCallRouting(
      fd({ clientId: "client1", forwardPhone: "+15550009999", dialTimeoutSeconds: "90" }),
    );
    expect(result.error).toMatch(/5-60/);
  });

  it("saves a normalized forward phone and the dial timeout", async () => {
    const updates: unknown[] = [];
    fakeSupabase = buildSupabase({ onUpdate: (patch) => updates.push(patch) });
    const { setClientCallRouting } = await import("@/app/admin/actions");
    const result = await setClientCallRouting(
      fd({
        clientId: "client1",
        forwardPhone: "(555) 000-9999",
        dialTimeoutSeconds: "15",
      }),
    );
    expect(result).toEqual({ ok: true });
    expect(updates).toContainEqual({
      forward_to_phone: "+15550009999",
      dial_timeout_seconds: 15,
    });
  });

  it("clears forward_to_phone when left blank", async () => {
    const updates: unknown[] = [];
    fakeSupabase = buildSupabase({ onUpdate: (patch) => updates.push(patch) });
    const { setClientCallRouting } = await import("@/app/admin/actions");
    await setClientCallRouting(
      fd({ clientId: "client1", forwardPhone: "", dialTimeoutSeconds: "15" }),
    );
    expect(updates).toContainEqual({
      forward_to_phone: null,
      dial_timeout_seconds: 15,
    });
  });
});

describe("setClientA2pStatus", () => {
  it("rejects an invalid status value", async () => {
    fakeSupabase = buildSupabase({});
    const { setClientA2pStatus } = await import("@/app/admin/actions");
    const result = await setClientA2pStatus(
      fd({ clientId: "client1", status: "yolo" }),
    );
    expect(result.error).toMatch(/invalid/i);
  });

  it("saves a valid status", async () => {
    const updates: unknown[] = [];
    fakeSupabase = buildSupabase({ onUpdate: (patch) => updates.push(patch) });
    const { setClientA2pStatus } = await import("@/app/admin/actions");
    const result = await setClientA2pStatus(
      fd({ clientId: "client1", status: "approved" }),
    );
    expect(result).toEqual({ ok: true });
    expect(updates).toContainEqual({ a2p_status: "approved" });
  });
});
