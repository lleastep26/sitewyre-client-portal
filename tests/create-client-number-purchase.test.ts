import { beforeEach, describe, expect, it, vi } from "vitest";

const buyLocalNumber = vi.fn();
const sendEmail = vi.fn();

vi.mock("@/lib/adapters", () => ({
  getSmsProvider: () => ({ buyLocalNumber }),
  getEmailProvider: () => ({ send: sendEmail }),
}));
vi.mock("@/lib/crm/apply-trade-preset", () => ({ applyTradePreset: vi.fn() }));
vi.mock("@/lib/automations", () => ({ ensureClientAutomations: vi.fn() }));

let insertedClient: Record<string, unknown> | null;

const supabase = {
  auth: { admin: { createUser: async () => ({ data: { user: { id: "user1" } }, error: null }) } },
  from(table: string) {
    if (table === "clients") {
      return {
        insert: (row: Record<string, unknown>) => {
          insertedClient = row;
          return { select: () => ({ single: async () => ({ data: { id: "client1", ...row }, error: null }) }) };
        },
      };
    }
    return { upsert: async () => ({ error: null }), insert: async () => ({ error: null }) };
  },
};

const input = { business_name: "Acme Plumbing", trade: "plumbing", email: "jo@example.com", phone: "405-555-0100" };

beforeEach(() => {
  vi.clearAllMocks();
  insertedClient = null;
  buyLocalNumber.mockResolvedValue({ phoneNumber: "+14055550199", sid: "PN1" });
  sendEmail.mockResolvedValue({ id: "e1" });
});

describe("createClientAccount and Twilio numbers", () => {
  it("never buys a number when the caller says to skip it, even with a phone entered", async () => {
    const { createClientAccount } = await import("@/lib/accounts/create-client");
    const result = await createClientAccount(supabase as never, input, {
      auditVia: "admin_add_client",
      skipNumberPurchase: true,
    });
    expect(result).toMatchObject({ ok: true, twilioPhoneNumber: null });
    expect(buyLocalNumber).not.toHaveBeenCalled();
    expect(insertedClient).toMatchObject({ twilio_phone_number: null, phone: "+14055550100" });
  });

  it("still provisions a number for the automated account route, which doesn't skip it", async () => {
    const { createClientAccount } = await import("@/lib/accounts/create-client");
    await createClientAccount(supabase as never, input, { auditVia: "internal_api" });
    expect(buyLocalNumber).toHaveBeenCalledWith("405");
  });
});
