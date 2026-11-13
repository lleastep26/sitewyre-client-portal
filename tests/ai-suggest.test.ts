import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const create = vi.fn();

vi.mock("@/lib/integrations/anthropic", () => ({
  AI_TEXT_MODEL: "claude-sonnet-5-5",
  supportsServerSideFallback: () => true,
  hasAnthropicKey: () => Boolean(process.env.ANTHROPIC_API_KEY),
  getAnthropicClient: () => ({ beta: { messages: { create } } }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("inbox AI suggest", () => {
  it("uses the shared model setting, not a hard-coded model", async () => {
    create.mockResolvedValue({ stop_reason: "end_turn", content: [{ type: "text", text: "Sure, how's Tuesday?" }] });
    const { getAiProvider } = await import("@/lib/adapters/ai");
    const suggestion = await getAiProvider().suggestReply("inbound: can you come this week?");
    expect(suggestion).toBe("Sure, how's Tuesday?");
    expect(create.mock.calls[0][0].model).toBe("claude-sonnet-5-5");
  });

  it("falls back to a safe default when the call fails", async () => {
    create.mockRejectedValue(new Error("down"));
    const { getAiProvider } = await import("@/lib/adapters/ai");
    expect(await getAiProvider().suggestReply("x")).toContain("we'll get back to you");
  });

  it("uses the fake provider when there's no key", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    const { getAiProvider } = await import("@/lib/adapters/ai");
    await getAiProvider().suggestReply("x");
    expect(create).not.toHaveBeenCalled();
  });
});
