import { beforeEach, describe, expect, it, vi } from "vitest";

let fakeSupabase: unknown;
let fakeClientRow: { id: string; business_name: string | null };
let fakeMembership: { user_id: string } | null;

const customersRetrieve = vi.fn();
const subscriptionsList = vi.fn();
const getUserById = vi.fn();
const emailSend = vi.fn();

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("stripe", () => ({
  default: class {
    customers = { retrieve: customersRetrieve };
    subscriptions = { list: subscriptionsList };
  },
}));
vi.mock("@/lib/auth/session", () => ({
  requireAdmin: async () => ({ supabase: fakeSupabase, user: { id: "admin1" } }),
  ADMIN_VIEW_COOKIE: "admin_view_client_id",
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ auth: { admin: { getUserById } } }),
}));
vi.mock("@/lib/adapters", () => ({
  getEmailProvider: () => ({ send: emailSend }),
}));

function fd(fields: Record<string, string>) {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.set(k, v);
  return form;
}

function buildSupabase(opts: { onUpdate?: (patch: unknown) => void } = {}) {
  return {
    from(table: string) {
      if (table === "clients") {
        return {
          update(patch: unknown) {
            opts.onUpdate?.(patch);
            return {
              eq: () => ({ then: (resolve: (v: { error: null }) => void) => resolve({ error: null }) }),
            };
          },
          select() {
            return this;
          },
          eq() {
            return this;
          },
          maybeSingle: async () => ({ data: fakeClientRow }),
        };
      }
      if (table === "memberships") {
        return {
          select() {
            return this;
          },
          eq() {
            return this;
          },
          maybeSingle: async () => ({ data: fakeMembership }),
        };
      }
      if (table === "audit_log") {
        return { insert: async () => ({ error: null }) };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://portal.example.com");
  vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_123");
  fakeClientRow = { id: "client1", business_name: "Acme Plumbing" };
  fakeMembership = { user_id: "user1" };
  fakeSupabase = buildSupabase();
});

describe("linkStripeCustomer", () => {
  it("rejects an id that doesn't look like a Stripe customer", async () => {
    const { linkStripeCustomer } = await import("@/app/admin/actions");
    const result = await linkStripeCustomer(fd({ clientId: "client1", customerId: "not-a-cus-id" }));
    expect("error" in result && result.error).toMatch(/cus_/);
    expect(customersRetrieve).not.toHaveBeenCalled();
  });

  it("errors when the customer has no subscription", async () => {
    customersRetrieve.mockResolvedValue({ id: "cus_1", deleted: false });
    subscriptionsList.mockResolvedValue({ data: [] });
    const { linkStripeCustomer } = await import("@/app/admin/actions");
    const result = await linkStripeCustomer(fd({ clientId: "client1", customerId: "cus_1" }));
    expect("error" in result && result.error).toMatch(/no subscription/i);
  });

  it("saves the customer, subscription and billing status, and returns the plan", async () => {
    customersRetrieve.mockResolvedValue({ id: "cus_1", deleted: false });
    subscriptionsList.mockResolvedValue({
      data: [
        {
          id: "sub_1",
          status: "active",
          items: {
            data: [{ price: { id: "price_1", nickname: null, product: { name: "Contractor 299" } } }],
          },
        },
      ],
    });
    const updates: unknown[] = [];
    fakeSupabase = buildSupabase({ onUpdate: (patch) => updates.push(patch) });
    const { linkStripeCustomer } = await import("@/app/admin/actions");
    const result = await linkStripeCustomer(fd({ clientId: "client1", customerId: "cus_1" }));

    expect(subscriptionsList).toHaveBeenCalledWith(
      expect.objectContaining({ customer: "cus_1" }),
    );
    expect(updates).toContainEqual({
      stripe_customer_id: "cus_1",
      stripe_subscription_id: "sub_1",
      billing_status: "active",
    });
    expect(result).toEqual({ ok: true, plan: "Contractor 299", status: "active" });
  });

  it("reports a past_due status from Stripe", async () => {
    customersRetrieve.mockResolvedValue({ id: "cus_1", deleted: false });
    subscriptionsList.mockResolvedValue({
      data: [
        {
          id: "sub_1",
          status: "past_due",
          items: { data: [{ price: { id: "price_1", nickname: "Contractor" } }] },
        },
      ],
    });
    const { linkStripeCustomer } = await import("@/app/admin/actions");
    const result = await linkStripeCustomer(fd({ clientId: "client1", customerId: "cus_1" }));
    expect(result).toMatchObject({ ok: true, status: "past_due" });
  });
});

describe("resendWelcomeEmail", () => {
  it("errors when the client has no owner membership", async () => {
    fakeMembership = null;
    const { resendWelcomeEmail } = await import("@/app/admin/actions");
    const result = await resendWelcomeEmail(fd({ clientId: "client1" }));
    expect(result).toEqual({ error: "No owner found for this client" });
    expect(emailSend).not.toHaveBeenCalled();
  });

  it("errors when the owner has no email on file", async () => {
    getUserById.mockResolvedValue({ data: { user: { email: null } }, error: null });
    const { resendWelcomeEmail } = await import("@/app/admin/actions");
    const result = await resendWelcomeEmail(fd({ clientId: "client1" }));
    expect(result).toEqual({ error: "Owner has no email on file" });
    expect(emailSend).not.toHaveBeenCalled();
  });

  it("sends the welcome email with a login link to the owner", async () => {
    getUserById.mockResolvedValue({ data: { user: { email: "owner@example.com" } }, error: null });
    const { resendWelcomeEmail } = await import("@/app/admin/actions");
    const result = await resendWelcomeEmail(fd({ clientId: "client1" }));
    expect(result).toEqual({ ok: true });
    expect(emailSend).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "owner@example.com",
        subject: "Your Sitewyre portal is ready",
        html: expect.stringContaining("https://portal.example.com/login"),
      }),
    );
  });
});
