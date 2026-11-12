import { beforeEach, describe, expect, it, vi } from "vitest";

let fakeSupabase: unknown;
let fakeClient: {
  id: string;
  twilio_phone_number: string | null;
  forward_to_phone: string | null;
  sms_monthly_allowance: number;
};
let fakeRole: string;

const previewLocalNumber = vi.fn();
const buyLocalNumberWithWebhooks = vi.fn();
const numberPurchaseBlockReasonMock = vi.fn();

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({
  requireMembership: async () => ({
    supabase: fakeSupabase,
    client: fakeClient,
    role: fakeRole,
    user: { id: "user1" },
  }),
}));
vi.mock("@/lib/phone/provision", () => ({
  previewLocalNumber: (areaCode: string) => previewLocalNumber(areaCode),
  buyLocalNumberWithWebhooks: (phoneNumber: string) => buyLocalNumberWithWebhooks(phoneNumber),
  numberPurchaseBlockReason: (client: unknown) => numberPurchaseBlockReasonMock(client),
}));

function makeClientsTable(onUpdate: (patch: unknown) => void) {
  const chain = {
    update(patch: unknown) {
      onUpdate(patch);
      return chain;
    },
    eq: () => chain,
    then(resolve: (v: { error: null }) => void) {
      resolve({ error: null });
    },
  };
  return chain;
}

function buildSupabase(onUpdate: (patch: unknown) => void) {
  return {
    from(table: string) {
      if (table === "clients") return makeClientsTable(onUpdate);
      if (table === "audit_log") return { insert: async () => ({ error: null }) };
      throw new Error(`unexpected table ${table}`);
    },
  };
}

function fd(fields: Record<string, string>) {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.set(k, v);
  return form;
}

beforeEach(() => {
  vi.clearAllMocks();
  fakeClient = {
    id: "client1",
    twilio_phone_number: null,
    forward_to_phone: "+15550001111",
    sms_monthly_allowance: 500,
  };
  fakeRole = "owner";
  numberPurchaseBlockReasonMock.mockReturnValue(null);
});

describe("previewOwnNumber", () => {
  it("blocks office from searching", async () => {
    fakeRole = "office";
    fakeSupabase = buildSupabase(() => undefined);
    const { previewOwnNumber } = await import("@/app/(app)/settings/phone-actions");
    const result = await previewOwnNumber(fd({ areaCode: "512" }));
    expect(result).toEqual({ error: expect.stringContaining("owner or a Sitewyre admin") });
    expect(previewLocalNumber).not.toHaveBeenCalled();
  });

  it("blocks when the shared guard returns a reason", async () => {
    numberPurchaseBlockReasonMock.mockReturnValue("already has a number");
    fakeSupabase = buildSupabase(() => undefined);
    const { previewOwnNumber } = await import("@/app/(app)/settings/phone-actions");
    const result = await previewOwnNumber(fd({ areaCode: "512" }));
    expect(result).toEqual({ error: "already has a number" });
    expect(previewLocalNumber).not.toHaveBeenCalled();
  });

  it("delegates to the shared preview helper when nothing blocks it", async () => {
    previewLocalNumber.mockResolvedValue({ phoneNumber: "+15125550123", monthlyPrice: "1.15" });
    fakeSupabase = buildSupabase(() => undefined);
    const { previewOwnNumber } = await import("@/app/(app)/settings/phone-actions");
    const result = await previewOwnNumber(fd({ areaCode: "512" }));
    expect(result).toEqual({ phoneNumber: "+15125550123", monthlyPrice: "1.15" });
    expect(previewLocalNumber).toHaveBeenCalledWith("512");
  });
});

describe("buyOwnNumber", () => {
  it("blocks crew from buying", async () => {
    fakeRole = "crew";
    fakeSupabase = buildSupabase(() => undefined);
    const { buyOwnNumber } = await import("@/app/(app)/settings/phone-actions");
    const result = await buyOwnNumber(fd({ phoneNumber: "+15125550123" }));
    expect(result).toEqual({ error: expect.stringContaining("owner or a Sitewyre admin") });
    expect(buyLocalNumberWithWebhooks).not.toHaveBeenCalled();
  });

  it("buys the number and saves it to the current client", async () => {
    buyLocalNumberWithWebhooks.mockResolvedValue({ phoneNumber: "+15125550123", sid: "PNabc" });
    const updates: unknown[] = [];
    fakeSupabase = buildSupabase((p) => updates.push(p));
    const { buyOwnNumber } = await import("@/app/(app)/settings/phone-actions");
    const result = await buyOwnNumber(fd({ phoneNumber: "+15125550123" }));
    expect(result).toEqual({ ok: true, phoneNumber: "+15125550123" });
    expect(updates[0]).toMatchObject({
      twilio_phone_number: "+15125550123",
      twilio_phone_sid: "PNabc",
    });
  });
});

describe("setOwnForwardPhone", () => {
  it("blocks office from changing it", async () => {
    fakeRole = "office";
    fakeSupabase = buildSupabase(() => undefined);
    const { setOwnForwardPhone } = await import("@/app/(app)/settings/phone-actions");
    const result = await setOwnForwardPhone(fd({ forwardPhone: "5550009999" }));
    expect(result).toEqual({ error: expect.stringContaining("owner or a Sitewyre admin") });
  });

  it("normalizes and saves the forward phone", async () => {
    const updates: unknown[] = [];
    fakeSupabase = buildSupabase((p) => updates.push(p));
    const { setOwnForwardPhone } = await import("@/app/(app)/settings/phone-actions");
    const result = await setOwnForwardPhone(fd({ forwardPhone: "(555) 000-9999" }));
    expect(result).toEqual({ ok: true });
    expect(updates[0]).toEqual({ forward_to_phone: "+15550009999" });
  });
});

describe("setSmsMonthlyAllowance", () => {
  it("blocks the owner — admin only", async () => {
    fakeSupabase = buildSupabase(() => undefined);
    const { setSmsMonthlyAllowance } = await import("@/app/(app)/settings/phone-actions");
    const result = await setSmsMonthlyAllowance(fd({ smsMonthlyAllowance: "1000" }));
    expect(result).toEqual({ error: expect.stringContaining("Sitewyre admin") });
  });

  it("rejects a negative or non-integer allowance", async () => {
    fakeRole = "sitewyre_admin";
    fakeSupabase = buildSupabase(() => undefined);
    const { setSmsMonthlyAllowance } = await import("@/app/(app)/settings/phone-actions");
    const result = await setSmsMonthlyAllowance(fd({ smsMonthlyAllowance: "-5" }));
    expect(result).toEqual({ error: expect.stringContaining("0-100,000") });
  });

  it("lets a sitewyre_admin update the allowance", async () => {
    fakeRole = "sitewyre_admin";
    const updates: unknown[] = [];
    fakeSupabase = buildSupabase((p) => updates.push(p));
    const { setSmsMonthlyAllowance } = await import("@/app/(app)/settings/phone-actions");
    const result = await setSmsMonthlyAllowance(fd({ smsMonthlyAllowance: "1000" }));
    expect(result).toEqual({ ok: true });
    expect(updates[0]).toEqual({ sms_monthly_allowance: 1000 });
  });
});
