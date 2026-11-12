import { beforeEach, describe, expect, it, vi } from "vitest";

const createUser = vi.fn();
const listUsers = vi.fn();
const applyTradePreset = vi.fn();
const ensureClientAutomations = vi.fn();
const emailSend = vi.fn();
let fakeClientRow: { id: string; site_key: string; twilio_phone_number: string | null };

vi.mock("@/lib/crm/apply-trade-preset", () => ({ applyTradePreset }));
vi.mock("@/lib/automations", () => ({ ensureClientAutomations }));
vi.mock("@/lib/adapters", () => ({
  getSmsProvider: () => ({ buyLocalNumber: vi.fn() }),
  getEmailProvider: () => ({ send: emailSend }),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    auth: { admin: { createUser, listUsers } },
    from(table: string) {
      if (table === "clients") {
        return {
          insert: () => ({
            select: () => ({
              single: async () => ({ data: fakeClientRow, error: null }),
            }),
          }),
        };
      }
      if (table === "memberships") {
        return { upsert: async () => ({ error: null }) };
      }
      if (table === "audit_log") {
        return { insert: async () => ({ error: null }) };
      }
      throw new Error(`unexpected table ${table}`);
    },
  }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("INTERNAL_API_SECRET", "test-secret");
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://portal.example.com");
  fakeClientRow = { id: "client1", site_key: "abc123", twilio_phone_number: null };
  createUser.mockResolvedValue({ data: { user: { id: "user1" } }, error: null });
});

function request(body: unknown, secret = "test-secret") {
  return new Request("https://portal.example.com/api/internal/accounts", {
    method: "POST",
    headers: { authorization: `Bearer ${secret}` },
    body: JSON.stringify(body),
  });
}

describe("POST /api/internal/accounts", () => {
  it("rejects a missing or wrong bearer secret", async () => {
    const { POST } = await import("@/app/api/internal/accounts/route");
    const res = await POST(request({ business_name: "Acme", trade: "cleaning", email: "a@b.com" }, "wrong"));
    expect(res.status).toBe(401);
    expect(ensureClientAutomations).not.toHaveBeenCalled();
  });

  it("seeds automations for the new client", async () => {
    const { POST } = await import("@/app/api/internal/accounts/route");
    await POST(request({ business_name: "Acme", trade: "cleaning", email: "owner@example.com" }));
    expect(ensureClientAutomations).toHaveBeenCalledWith(expect.anything(), "client1");
  });

  it("sends a welcome email with a plain login link, not a magic link", async () => {
    const { POST } = await import("@/app/api/internal/accounts/route");
    const res = await POST(
      request({ business_name: "Acme", trade: "cleaning", email: "owner@example.com" }),
    );
    expect(res.status).toBe(200);
    expect(emailSend).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "owner@example.com",
        subject: "Your Sitewyre portal is ready",
        html: expect.stringContaining("https://portal.example.com/login"),
      }),
    );
  });

  it("still returns ok when the welcome email fails to send", async () => {
    emailSend.mockRejectedValue(new Error("Resend down"));
    const { POST } = await import("@/app/api/internal/accounts/route");
    const res = await POST(
      request({ business_name: "Acme", trade: "cleaning", email: "owner@example.com" }),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({ ok: true, client_id: "client1" });
  });
});
