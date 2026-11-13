import { beforeEach, describe, expect, it, vi } from "vitest";

let fakeSupabase: unknown;
let fakeClient: {
  id: string;
  twilio_phone_number: string | null;
  business_name: string;
  timezone: string | null;
};
let fakeCandidates: {
  id: string;
  name: string;
  phone: string;
  last_texted_at: string | null;
}[];
let optedOutPhones: string[];
let sentEvents: unknown[];

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({
  requireMembership: async () => ({ supabase: fakeSupabase, client: fakeClient }),
}));
vi.mock("@/lib/a2p/sending", () => ({
  resolveSmsFrom: () => "+15555550100",
}));
vi.mock("@/lib/funnels/opt-out", () => ({
  isOptedOut: async (_s: unknown, _c: string, phone: string) =>
    optedOutPhones.includes(phone),
}));
vi.mock("@/lib/inngest/client", () => ({
  inngest: {
    send: (event: unknown) => {
      sentEvents.push(event);
      return Promise.resolve(undefined);
    },
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  fakeClient = {
    id: "client1",
    twilio_phone_number: "+15555550100",
    business_name: "Acme Plumbing",
    timezone: "America/Chicago",
  };
  fakeCandidates = [];
  optedOutPhones = [];
  sentEvents = [];
  fakeSupabase = {
    from: () => ({
      select: () => ({
        eq: () => ({
          in: () => ({
            lt: () => ({
              or: async () => ({ data: fakeCandidates }),
            }),
          }),
        }),
      }),
    }),
  };
});

describe("reactivateOldLeads", () => {
  it("requires a Twilio number", async () => {
    fakeClient.twilio_phone_number = null;
    const { reactivateOldLeads } = await import("@/app/(app)/leads/actions");
    const result = await reactivateOldLeads();
    expect(result).toEqual({ error: expect.stringContaining("Twilio number") });
  });

  it("schedules every eligible, non-opted-out candidate", async () => {
    fakeCandidates = [
      { id: "lead1", name: "Jo Owner", phone: "+15125550001", last_texted_at: null },
      { id: "lead2", name: "Sam Smith", phone: "+15125550002", last_texted_at: null },
    ];
    const { reactivateOldLeads } = await import("@/app/(app)/leads/actions");
    const result = await reactivateOldLeads();
    expect(result).toEqual({ ok: true, scheduled: 2, skipped: 0 });
    expect(sentEvents).toHaveLength(2);
    expect(sentEvents[0]).toEqual(
      expect.objectContaining({
        name: "portal/lead_reactivation.contact_started",
        data: expect.objectContaining({ clientId: "client1", leadId: "lead1", firstName: "Jo" }),
      }),
    );
  });

  it("skips opted-out candidates and still schedules the rest", async () => {
    fakeCandidates = [
      { id: "lead1", name: "Jo Owner", phone: "+15125550001", last_texted_at: null },
      { id: "lead2", name: "Opted Out", phone: "+15125550002", last_texted_at: null },
    ];
    optedOutPhones = ["+15125550002"];
    const { reactivateOldLeads } = await import("@/app/(app)/leads/actions");
    const result = await reactivateOldLeads();
    expect(result).toEqual({ ok: true, scheduled: 1, skipped: 1 });
    expect(sentEvents).toHaveLength(1);
  });

  it("returns zero scheduled when nothing matches", async () => {
    fakeCandidates = [];
    const { reactivateOldLeads } = await import("@/app/(app)/leads/actions");
    const result = await reactivateOldLeads();
    expect(result).toEqual({ ok: true, scheduled: 0, skipped: 0 });
    expect(sentEvents).toHaveLength(0);
  });
});
