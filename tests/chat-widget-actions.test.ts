import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let fakeRole: string;
let fakeClient: { id: string; site_key: string | null };
let updates: unknown[];

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

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({
  requireMembership: async () => ({ supabase: { from: () => chain }, client: fakeClient, role: fakeRole }),
}));

function fd(enabled: string) {
  const form = new FormData();
  form.set("enabled", enabled);
  return form;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
  fakeRole = "owner";
  fakeClient = { id: "client1", site_key: "abc" };
  updates = [];
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("setChatWidgetEnabled", () => {
  it("turns the widget on for the owner", async () => {
    const { setChatWidgetEnabled } = await import("@/app/(app)/settings/chat-widget-actions");
    expect(await setChatWidgetEnabled(fd("true"))).toEqual({ ok: true });
    expect(updates).toEqual([{ chat_widget_enabled: true }]);
  });

  it("blocks office and crew", async () => {
    fakeRole = "crew";
    const { setChatWidgetEnabled } = await import("@/app/(app)/settings/chat-widget-actions");
    expect(await setChatWidgetEnabled(fd("true"))).toEqual({ error: expect.stringContaining("owner or a Sitewyre admin") });
    expect(updates).toHaveLength(0);
  });

  it("refuses to turn on without an Anthropic key or a site key", async () => {
    const { setChatWidgetEnabled } = await import("@/app/(app)/settings/chat-widget-actions");
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    expect(await setChatWidgetEnabled(fd("true"))).toEqual({ error: expect.stringContaining("ANTHROPIC_API_KEY") });
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    fakeClient = { id: "client1", site_key: null };
    expect(await setChatWidgetEnabled(fd("true"))).toEqual({ error: expect.stringContaining("site key") });
    expect(updates).toHaveLength(0);
  });

  it("can always be turned off", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    const { setChatWidgetEnabled } = await import("@/app/(app)/settings/chat-widget-actions");
    expect(await setChatWidgetEnabled(fd("false"))).toEqual({ ok: true });
    expect(updates).toEqual([{ chat_widget_enabled: false }]);
  });
});
