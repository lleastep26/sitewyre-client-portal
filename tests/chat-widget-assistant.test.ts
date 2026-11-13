import { beforeEach, describe, expect, it, vi } from "vitest";

const create = vi.fn();

vi.mock("@/lib/integrations/anthropic", () => ({
  AI_CHAT_MODEL: "claude-sonnet-5-5",
  supportsServerSideFallback: () => true,
  getAnthropicClient: () => ({ beta: { messages: { create } } }),
}));

const usage = { input_tokens: 50, output_tokens: 10, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };

async function run(question = "Do you service Round Rock?") {
  const { runChatAssistant } = await import("@/lib/chat-widget/assistant");
  return runChatAssistant({
    systemPrompt: "SYSTEM",
    contextNote: "Booking page link: https://portal.example/book/abc",
    history: [{ role: "visitor", body: question }],
    allowedTimeText: "Monday: 09:00–17:00",
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("runChatAssistant", () => {
  it("answers from the knowledge with one model call and no booking tools", async () => {
    create.mockResolvedValue({ stop_reason: "end_turn", content: [{ type: "text", text: "Yes, we cover Round Rock." }], usage });
    const outcome = await run();
    expect(outcome).toMatchObject({ kind: "reply", text: "Yes, we cover Round Rock.", inputTokens: 50, outputTokens: 10 });

    const params = create.mock.calls[0][0];
    expect(params.model).toBe("claude-sonnet-5-5");
    expect(params.output_config).toEqual({ effort: "low" });
    expect(params.tools.map((t: { name: string }) => t.name)).toEqual(["team_will_follow_up"]);
    expect(params.tool_choice).toBeUndefined();
    expect(params.system[0]).toMatchObject({ text: "SYSTEM", cache_control: { type: "ephemeral" } });
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("says the team will follow up when the model isn't sure", async () => {
    create.mockResolvedValue({
      stop_reason: "tool_use",
      content: [{ type: "tool_use", id: "tu1", name: "team_will_follow_up", input: { summary: "Asked for a price." } }],
      usage,
    });
    expect(await run("How much is a water heater?")).toMatchObject({ kind: "follow_up", summary: "Asked for a price." });
  });

  it("never shows a reply that quotes a price", async () => {
    create.mockResolvedValue({ stop_reason: "end_turn", content: [{ type: "text", text: "About $900 installed." }], usage });
    expect(await run()).toMatchObject({ kind: "follow_up" });
  });

  it("never shows a reply that promises a time", async () => {
    create.mockResolvedValue({ stop_reason: "end_turn", content: [{ type: "text", text: "We can be there at 3pm." }], usage });
    expect(await run()).toMatchObject({ kind: "follow_up" });
  });

  it("falls back to follow-up on a refusal or an API failure", async () => {
    create.mockResolvedValueOnce({ stop_reason: "refusal", content: [], usage });
    expect(await run()).toMatchObject({ kind: "follow_up" });
    create.mockRejectedValueOnce(new Error("network"));
    expect(await run()).toMatchObject({ kind: "follow_up" });
  });
});
