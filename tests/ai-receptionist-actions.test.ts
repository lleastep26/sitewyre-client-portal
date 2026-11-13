import { beforeEach, describe, expect, it, vi } from "vitest";

let fakeSupabase: unknown;
let fakeClient: { id: string };
let fakeRole: string;
let updates: unknown[];

const syncRetellAgent = vi.fn();

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({
  requireMembership: async () => ({ supabase: fakeSupabase, client: fakeClient, role: fakeRole }),
}));
vi.mock("@/lib/retell/agent-sync", () => ({ syncRetellAgent }));

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

function fd(fields: Record<string, string>) {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.set(k, v);
  return form;
}

beforeEach(() => {
  vi.clearAllMocks();
  fakeClient = { id: "client1" };
  fakeRole = "owner";
  updates = [];
  fakeSupabase = { from: () => makeClientsTable((p) => updates.push(p)) };
});

describe("setAiReceptionistEnabled", () => {
  it("blocks office from toggling it", async () => {
    fakeRole = "office";
    const { setAiReceptionistEnabled } = await import(
      "@/app/(app)/settings/ai-receptionist-actions"
    );
    const result = await setAiReceptionistEnabled(fd({ enabled: "true" }));
    expect(result).toEqual({ error: expect.stringContaining("owner or a Sitewyre admin") });
    expect(updates).toHaveLength(0);
  });

  it("creates/syncs the Retell agent before turning it on", async () => {
    syncRetellAgent.mockResolvedValue({ ok: true });
    const { setAiReceptionistEnabled } = await import(
      "@/app/(app)/settings/ai-receptionist-actions"
    );
    const result = await setAiReceptionistEnabled(fd({ enabled: "true" }));
    expect(result).toEqual({ ok: true });
    expect(syncRetellAgent).toHaveBeenCalledWith(fakeSupabase, "client1");
    expect(updates).toContainEqual({ ai_receptionist_enabled: true });
  });

  it("doesn't flip the flag on when the Retell sync fails", async () => {
    syncRetellAgent.mockResolvedValue({ error: "RETELL_API_KEY missing" });
    const { setAiReceptionistEnabled } = await import(
      "@/app/(app)/settings/ai-receptionist-actions"
    );
    const result = await setAiReceptionistEnabled(fd({ enabled: "true" }));
    expect(result).toEqual({ error: "RETELL_API_KEY missing" });
    expect(updates).toHaveLength(0);
  });

  it("turning it off never touches Retell", async () => {
    const { setAiReceptionistEnabled } = await import(
      "@/app/(app)/settings/ai-receptionist-actions"
    );
    const result = await setAiReceptionistEnabled(fd({ enabled: "false" }));
    expect(result).toEqual({ ok: true });
    expect(syncRetellAgent).not.toHaveBeenCalled();
    expect(updates).toContainEqual({ ai_receptionist_enabled: false });
  });
});

describe("setRetellMinutesAllowance", () => {
  it("is admin-only, not owner", async () => {
    const { setRetellMinutesAllowance } = await import(
      "@/app/(app)/settings/ai-receptionist-actions"
    );
    const result = await setRetellMinutesAllowance(fd({ retellMinutesAllowance: "300" }));
    expect(result).toEqual({ error: expect.stringContaining("Sitewyre admin") });
    expect(updates).toHaveLength(0);
  });

  it("lets a sitewyre_admin set a new allowance", async () => {
    fakeRole = "sitewyre_admin";
    const { setRetellMinutesAllowance } = await import(
      "@/app/(app)/settings/ai-receptionist-actions"
    );
    const result = await setRetellMinutesAllowance(fd({ retellMinutesAllowance: "300" }));
    expect(result).toEqual({ ok: true });
    expect(updates).toContainEqual({ retell_minutes_allowance: 300 });
  });

  it("rejects a negative allowance", async () => {
    fakeRole = "sitewyre_admin";
    const { setRetellMinutesAllowance } = await import(
      "@/app/(app)/settings/ai-receptionist-actions"
    );
    const result = await setRetellMinutesAllowance(fd({ retellMinutesAllowance: "-5" }));
    expect(result).toEqual({ error: expect.stringContaining("0-100,000") });
  });
});
