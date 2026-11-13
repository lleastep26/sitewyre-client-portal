import Anthropic from "@anthropic-ai/sdk";
import {
  AI_CHAT_MODEL,
  getAnthropicClient,
  supportsServerSideFallback,
} from "@/lib/integrations/anthropic";
import { checkReplyGuards } from "@/lib/assistant/guards";

type BetaTool = Anthropic.Beta.BetaTool;

export type ChatTurn = { role: "visitor" | "assistant"; body: string };

export type ChatOutcome =
  | { kind: "reply"; text: string; inputTokens: number; outputTokens: number }
  | { kind: "follow_up"; summary: string; inputTokens: number; outputTokens: number };

const TOOLS: BetaTool[] = [
  {
    name: "team_will_follow_up",
    description:
      "Use instead of replying when you can't answer from the business knowledge (pricing included), the visitor is upset or asks for a person, or the visitor describes an emergency. The team is alerted and the visitor is told they'll follow up.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        summary: { type: "string", description: "One sentence for the owner on what the visitor needs." },
      },
      required: ["summary"],
      additionalProperties: false,
    },
  },
];

/**
 * Answers one website-chat message from the Business knowledge summary, or
 * decides the team should follow up. Never throws: a model error, a
 * refusal, or a reply that fails the price/time guards all become
 * "the team will follow up".
 */
export async function runChatAssistant(input: {
  systemPrompt: string;
  /** Per-conversation context: current date/time, booking page link. */
  contextNote: string;
  history: ChatTurn[];
  /** Text that clock times in a reply may legitimately come from. */
  allowedTimeText: string;
}): Promise<ChatOutcome> {
  let inputTokens = 0;
  let outputTokens = 0;
  const followUp = (summary: string): ChatOutcome => ({
    kind: "follow_up",
    summary,
    inputTokens,
    outputTokens,
  });

  try {
    const response = await getAnthropicClient().beta.messages.create({
      model: AI_CHAT_MODEL,
      max_tokens: 16000,
      output_config: { effort: "low" },
      ...(supportsServerSideFallback(AI_CHAT_MODEL)
        ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const }
        : {}),
      system: [
        { type: "text", text: input.systemPrompt, cache_control: { type: "ephemeral" } },
        { type: "text", text: input.contextNote },
      ],
      tools: TOOLS,
      messages: input.history
        .filter((turn) => turn.body.trim())
        .map((turn) => ({
          role: turn.role === "visitor" ? ("user" as const) : ("assistant" as const),
          content: turn.body,
        })),
    });

    inputTokens =
      response.usage.input_tokens +
      (response.usage.cache_read_input_tokens ?? 0) +
      (response.usage.cache_creation_input_tokens ?? 0);
    outputTokens = response.usage.output_tokens;

    if (response.stop_reason === "refusal") return followUp("The AI declined to answer this message.");

    const toolUse = response.content.find(
      (b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use",
    );
    if (toolUse) {
      const args = (toolUse.input ?? {}) as Record<string, unknown>;
      return followUp(typeof args.summary === "string" && args.summary ? args.summary : "The visitor needs the team.");
    }

    if (response.stop_reason !== "end_turn") {
      return followUp(`The AI stopped early (${response.stop_reason ?? "unknown"}).`);
    }

    const text = response.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
    const guard = checkReplyGuards(text, { allowedTimeText: input.allowedTimeText, bookedThisRun: false });
    if (!guard.ok) return followUp(`The AI's draft reply was blocked (${guard.reason}).`);

    return { kind: "reply", text, inputTokens, outputTokens };
  } catch (error) {
    const detail =
      error instanceof Anthropic.APIError
        ? `API error ${error.status ?? "unknown"}`
        : error instanceof Error
          ? error.message
          : "unknown error";
    return followUp(`The AI couldn't reply (${detail}).`);
  }
}
