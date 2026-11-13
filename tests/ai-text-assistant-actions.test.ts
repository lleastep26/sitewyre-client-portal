import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let fakeSupabase: unknown;
let fakeRole: string;
let updates: unknown[];

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({
  requireMembership: async () => ({ supabase: fakeSupabase, client: { id: "client1" }, role: fakeRole }),
}));

function makeClientsTable() {
  const chain = {
    update(patch: unknown) {
      updates.push(patch);
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
  vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
  fakeRole = "owner";
  updates = [];
  fakeSupabase = { from: () => makeClientsTable() };
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("setAiTextAssistantEnabled", () => {
  it("blocks office from toggling it", async () => {
    fakeRole = "office";
    const { setAiTextAssistantEnabled } = await import("@/app/(app)/settings/ai-text-assistant-actions");
    const result = await setAiTextAssistantEnabled(fd({ enabled: "true" }));
    expect(result).toEqual({ error: expect.stringContaining("owner or a Sitewyre admin") });
    expect(updates).toHaveLength(0);
  });

  it("turns it on for the owner", async () => {
    const { setAiTextAssistantEnabled } = await import("@/app/(app)/settings/ai-text-assistant-actions");
    expect(await setAiTextAssistantEnabled(fd({ enabled: "true" }))).toEqual({ ok: true });
    expect(updates).toContainEqual({ ai_text_assistant_enabled: true });
  });

  it("refuses to turn on without an Anthropic key, with a clear error", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    const { setAiTextAssistantEnabled } = await import("@/app/(app)/settings/ai-text-assistant-actions");
    const result = await setAiTextAssistantEnabled(fd({ enabled: "true" }));
    expect(result).toEqual({ error: expect.stringContaining("ANTHROPIC_API_KEY") });
    expect(updates).toHaveLength(0);
  });

  it("can always be turned off, key or not", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    const { setAiTextAssistantEnabled } = await import("@/app/(app)/settings/ai-text-assistant-actions");
    expect(await setAiTextAssistantEnabled(fd({ enabled: "false" }))).toEqual({ ok: true });
    expect(updates).toContainEqual({ ai_text_assistant_enabled: false });
  });
});

describe("setAiTextRepliesAllowance", () => {
  it("is admin-only, not owner", async () => {
    const { setAiTextRepliesAllowance } = await import("@/app/(app)/settings/ai-text-assistant-actions");
    const result = await setAiTextRepliesAllowance(fd({ aiTextRepliesAllowance: "800" }));
    expect(result).toEqual({ error: expect.stringContaining("Sitewyre admin") });
    expect(updates).toHaveLength(0);
  });

  it("lets a sitewyre_admin set it", async () => {
    fakeRole = "sitewyre_admin";
    const { setAiTextRepliesAllowance } = await import("@/app/(app)/settings/ai-text-assistant-actions");
    expect(await setAiTextRepliesAllowance(fd({ aiTextRepliesAllowance: "800" }))).toEqual({ ok: true });
    expect(updates).toContainEqual({ ai_text_replies_allowance: 800 });
  });

  it("rejects a fractional allowance", async () => {
    fakeRole = "sitewyre_admin";
    const { setAiTextRepliesAllowance } = await import("@/app/(app)/settings/ai-text-assistant-actions");
    const result = await setAiTextRepliesAllowance(fd({ aiTextRepliesAllowance: "12.5" }));
    expect(result).toEqual({ error: expect.stringContaining("whole number") });
  });
});
