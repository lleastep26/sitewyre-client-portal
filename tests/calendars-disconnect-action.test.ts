import { beforeEach, describe, expect, it, vi } from "vitest";

let fakeSupabase: unknown;
let fakeClient: { id: string } | null;
let fakeRole: string;
let deleted: string[];

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({
  requireMembership: async () => ({ supabase: fakeSupabase, client: fakeClient, role: fakeRole }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  fakeClient = { id: "client1" };
  fakeRole = "owner";
  deleted = [];
  fakeSupabase = {
    from: () => ({
      delete: () => ({
        eq: (_col: string, value: string) => {
          deleted.push(value);
          return Promise.resolve({ error: null });
        },
      }),
    }),
  };
});

describe("disconnectCalendar", () => {
  it("blocks office from disconnecting", async () => {
    fakeRole = "office";
    const { disconnectCalendar } = await import("@/app/(app)/settings/calendars-actions");
    const result = await disconnectCalendar();
    expect(result).toEqual({ error: expect.stringContaining("owner or a Sitewyre admin") });
    expect(deleted).toHaveLength(0);
  });

  it("lets the owner disconnect", async () => {
    const { disconnectCalendar } = await import("@/app/(app)/settings/calendars-actions");
    const result = await disconnectCalendar();
    expect(result).toEqual({ ok: true });
    expect(deleted).toEqual(["client1"]);
  });
});
