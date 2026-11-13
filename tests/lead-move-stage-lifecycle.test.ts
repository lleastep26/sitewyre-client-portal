import { beforeEach, describe, expect, it, vi } from "vitest";

let fakeSupabase: unknown;
let fakeStage: { id: string; is_won: boolean; is_lost: boolean } | null;
let updates: unknown[];

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({
  requireMembership: async () => ({ supabase: fakeSupabase, client: { id: "client1" } }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  updates = [];
  fakeSupabase = {
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            single: async () => ({ data: fakeStage }),
          }),
        }),
      }),
      update: (patch: unknown) => {
        updates.push(patch);
        return {
          eq: () => ({
            eq: async () => ({ error: null }),
          }),
        };
      },
    }),
  };
});

describe("moveLead lifecycle sync", () => {
  it("marks the lead booked when moved to a won stage", async () => {
    fakeStage = { id: "stage-won", is_won: true, is_lost: false };
    const { moveLead } = await import("@/app/(app)/leads/actions");
    const result = await moveLead({ leadId: "lead1", stageId: "stage-won", value: 500 });
    expect(result).toEqual({ ok: true });
    expect(updates).toContainEqual(
      expect.objectContaining({ lifecycle_status: "booked", value: 500 }),
    );
  });

  it("marks the lead lost when moved to a lost stage", async () => {
    fakeStage = { id: "stage-lost", is_won: false, is_lost: true };
    const { moveLead } = await import("@/app/(app)/leads/actions");
    const result = await moveLead({
      leadId: "lead1",
      stageId: "stage-lost",
      lostReason: "Went with someone else",
    });
    expect(result).toEqual({ ok: true });
    expect(updates).toContainEqual(
      expect.objectContaining({
        lifecycle_status: "lost",
        lost_reason: "Went with someone else",
      }),
    );
  });

  it("leaves lifecycle_status untouched for a neutral stage move", async () => {
    fakeStage = { id: "stage-contacted", is_won: false, is_lost: false };
    const { moveLead } = await import("@/app/(app)/leads/actions");
    await moveLead({ leadId: "lead1", stageId: "stage-contacted" });
    expect(updates[0]).not.toHaveProperty("lifecycle_status");
  });
});
