import { beforeEach, describe, expect, it, vi } from "vitest";
import Anthropic from "@anthropic-ai/sdk";

const create = vi.fn();

vi.mock("@/lib/integrations/anthropic", () => ({
  AI_TEXT_MODEL: "claude-sonnet-5-5",
  supportsServerSideFallback: () => true,
  getAnthropicClient: () => ({ beta: { messages: { create } } }),
}));

const usage = { input_tokens: 100, output_tokens: 20, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };

function textResponse(text: string) {
  return { stop_reason: "end_turn", content: [{ type: "text", text }], usage };
}
function toolResponse(name: string, input: unknown, id = "tu_1") {
  return {
    stop_reason: "tool_use",
    content: [
      { type: "thinking", thinking: "", signature: "sig" },
      { type: "tool_use", id, name, input },
    ],
    usage,
  };
}

const checkAvailability = vi.fn();
const bookAppointment = vi.fn();

async function run(lastText = "Do you do drain cleaning?") {
  const { runTextAssistant } = await import("@/lib/assistant/text-assistant");
  return runTextAssistant({
    systemPrompt: "SYSTEM",
    contextNote: "Current date and time: Friday",
    thread: [
      { direction: "outbound", body: "Hi Jo, thanks for contacting Acme." },
      { direction: "inbound", body: lastText },
    ],
    allowedTimeText: "Monday: 09:00–17:00",
    tools: { checkAvailability, bookAppointment },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("runTextAssistant", () => {
  it("returns the model's reply and sends the request the way the plan says", async () => {
    create.mockResolvedValueOnce(textResponse("Yes, we do. Want me to find a time?"));
    const outcome = await run();

    expect(outcome).toMatchObject({ kind: "reply", text: "Yes, we do. Want me to find a time?", booked: null });
    expect(outcome.usage).toEqual({ model: "claude-sonnet-5-5", inputTokens: 100, outputTokens: 20 });

    const params = create.mock.calls[0][0];
    expect(params.model).toBe("claude-sonnet-5-5");
    expect(params.output_config).toEqual({ effort: "low" });
    expect(params.fallbacks).toBe("default");
    expect(params.betas).toEqual(["server-side-fallback-2026-07-01"]);
    expect(params.tool_choice).toBeUndefined();
    expect(params.thinking).toBeUndefined();
    expect(params.tools.every((t: { strict?: boolean }) => t.strict === true)).toBe(true);
    // Stable prompt first (cached), per-conversation context after it.
    expect(params.system[0]).toMatchObject({ text: "SYSTEM", cache_control: { type: "ephemeral" } });
    expect(params.system[1].text).toContain("Current date and time");
    // The thread opened with the business's own text, so a user turn is put first.
    expect(params.messages[0].role).toBe("user");
    expect(params.messages.at(-1)).toEqual({ role: "user", content: "Do you do drain cleaning?" });
  });

  it("checks the calendar, then offers a time the calendar returned", async () => {
    create
      .mockResolvedValueOnce(toolResponse("check_availability", { service_name: "drain", earliest: "2026-11-16" }))
      .mockResolvedValueOnce(textResponse("I have Mon 2:00 PM open. Does that work?"));
    checkAvailability.mockResolvedValue({
      service: "Drain Cleaning",
      timezone: "America/Chicago",
      available_times: [{ start_at: "2026-11-16T20:00:00.000Z", local: "Mon, Nov 16, 2:00 PM" }],
    });

    const outcome = await run("Anything Monday?");
    expect(outcome).toMatchObject({ kind: "reply", text: "I have Mon 2:00 PM open. Does that work?" });
    expect(checkAvailability).toHaveBeenCalledWith({ serviceName: "drain", earliest: "2026-11-16" });

    // The assistant turn goes back unchanged (thinking block included),
    // followed by one user message carrying the tool result.
    const second = create.mock.calls[1][0];
    expect(second.messages.at(-2)).toMatchObject({ role: "assistant" });
    expect(second.messages.at(-2).content[0].type).toBe("thinking");
    expect(second.messages.at(-1).content[0]).toMatchObject({ type: "tool_result", tool_use_id: "tu_1" });
    expect(outcome.usage.inputTokens).toBe(200);
  });

  it("books and confirms", async () => {
    create
      .mockResolvedValueOnce(
        toolResponse("book_appointment", {
          service_name: "drain",
          start_at: "2026-11-16T20:00:00.000Z",
          customer_name: "Jo",
        }),
      )
      .mockResolvedValueOnce(textResponse("You're booked for Mon 2:00 PM. See you then."));
    bookAppointment.mockResolvedValue({
      ok: true,
      appointment_id: "appt1",
      start_at: "2026-11-16T20:00:00.000Z",
      local: "Mon, Nov 16, 2:00 PM",
      service: "Drain Cleaning",
    });

    const outcome = await run("2pm Monday works");
    expect(outcome).toMatchObject({
      kind: "reply",
      booked: { service: "Drain Cleaning", local: "Mon, Nov 16, 2:00 PM" },
    });
  });

  it("hands off when the model calls hand_off_to_owner", async () => {
    create.mockResolvedValueOnce(
      toolResponse("hand_off_to_owner", { reason: "upset", summary: "Customer is angry about a missed visit." }),
    );
    const outcome = await run("You never showed up!!");
    expect(outcome).toMatchObject({
      kind: "handoff",
      reason: "upset",
      summary: "Customer is angry about a missed visit.",
    });
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("hands off instead of sending a reply that quotes a price", async () => {
    create.mockResolvedValueOnce(textResponse("A drain cleaning is $149."));
    const outcome = await run("How much?");
    expect(outcome).toMatchObject({ kind: "handoff", reason: "guard_blocked" });
  });

  it("hands off instead of promising a time the calendar never returned", async () => {
    create.mockResolvedValueOnce(textResponse("We'll be there at 3pm tomorrow."));
    const outcome = await run("When can you come?");
    expect(outcome).toMatchObject({ kind: "handoff", reason: "guard_blocked" });
  });

  it("hands off on a refusal", async () => {
    create.mockResolvedValueOnce({ stop_reason: "refusal", content: [], usage });
    const outcome = await run();
    expect(outcome).toMatchObject({ kind: "handoff", reason: "error" });
  });

  it("hands off when the API call fails, without throwing", async () => {
    create.mockRejectedValueOnce(
      new Anthropic.APIError(529, { type: "error" }, "overloaded", new Headers()),
    );
    const outcome = await run();
    expect(outcome).toMatchObject({ kind: "handoff", reason: "error" });
    if (outcome.kind === "handoff") expect(outcome.summary).toContain("529");
  });

  it("gives up and hands off if the model keeps calling tools", async () => {
    create.mockResolvedValue(toolResponse("check_availability", { service_name: "drain", earliest: "2026-11-16" }));
    checkAvailability.mockResolvedValue({ error: "No bookable service." });
    const outcome = await run();
    expect(outcome).toMatchObject({ kind: "handoff", reason: "error" });
    expect(create).toHaveBeenCalledTimes(4);
  });
});
