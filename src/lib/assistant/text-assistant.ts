import Anthropic from "@anthropic-ai/sdk";
import {
  AI_TEXT_MODEL,
  getAnthropicClient,
  supportsServerSideFallback,
} from "@/lib/integrations/anthropic";
import type { AvailabilityResult, BookingResult } from "./booking";
import {
  checkReplyGuards,
  MODEL_HANDOFF_REASONS,
  type HandoffReason,
} from "./guards";

type BetaMessageParam = Anthropic.Beta.BetaMessageParam;
type BetaTool = Anthropic.Beta.BetaTool;
type BetaToolResultBlockParam = Anthropic.Beta.BetaToolResultBlockParam;
type BetaToolUseBlock = Anthropic.Beta.BetaToolUseBlock;

const MAX_MODEL_CALLS = 4;

export type ThreadMessage = { direction: "inbound" | "outbound"; body: string };

export type AssistantUsage = { model: string; inputTokens: number; outputTokens: number };

export type AssistantOutcome =
  | { kind: "reply"; text: string; booked: { service: string; local: string } | null; usage: AssistantUsage }
  | { kind: "handoff"; reason: HandoffReason; summary: string; usage: AssistantUsage };

export type AssistantTools = {
  checkAvailability: (args: { serviceName: string; earliest: string | null }) => Promise<AvailabilityResult>;
  bookAppointment: (args: {
    serviceName: string;
    startAt: string;
    customerName: string;
  }) => Promise<BookingResult>;
};

const TOOLS: BetaTool[] = [
  {
    name: "check_availability",
    description:
      "Look up open appointment times for one of the bookable appointment types over the next 7 days. Call this before offering any time to the customer.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        service_name: { type: "string", description: "The bookable appointment type the customer wants." },
        earliest: {
          type: "string",
          description:
            "The earliest date to look from, as an ISO 8601 date (for example 2026-11-16). Use today's date if the customer didn't ask for a particular day.",
        },
      },
      required: ["service_name", "earliest"],
      additionalProperties: false,
    },
  },
  {
    name: "book_appointment",
    description:
      "Book the appointment. Call this only after the customer has agreed to one specific time returned by check_availability.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        service_name: { type: "string", description: "The bookable appointment type." },
        start_at: {
          type: "string",
          description: "The start_at value of the chosen time, exactly as check_availability returned it.",
        },
        customer_name: { type: "string", description: "The customer's name." },
      },
      required: ["service_name", "start_at", "customer_name"],
      additionalProperties: false,
    },
  },
  {
    name: "hand_off_to_owner",
    description:
      "Pass this conversation to the business owner instead of replying. Use it when you can't answer from the business knowledge (pricing included), the customer is upset, the customer asks for a person, or the customer describes an emergency.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        reason: { type: "string", enum: [...MODEL_HANDOFF_REASONS] },
        summary: { type: "string", description: "One sentence for the owner on what the customer needs." },
      },
      required: ["reason", "summary"],
      additionalProperties: false,
    },
  },
];

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** Thread → API messages. The API needs the first message to be from the
 * user, and most threads open with the business's own auto-reply. */
function toApiMessages(thread: ThreadMessage[]): BetaMessageParam[] {
  const messages: BetaMessageParam[] = thread
    .filter((m) => m.body.trim())
    .map((m) => ({
      role: m.direction === "inbound" ? ("user" as const) : ("assistant" as const),
      content: m.body,
    }));
  if (messages[0]?.role === "assistant") {
    messages.unshift({ role: "user", content: "(The business texted the customer first.)" });
  }
  return messages;
}

/**
 * Drafts the next reply in a text thread, or decides to hand off. Never
 * throws: any model error, refusal, or failed guard becomes a hand-off, so
 * a customer is never left without an answer and a bad reply is never sent.
 */
export async function runTextAssistant(input: {
  systemPrompt: string;
  /** Per-conversation context (current date/time, the lead's original request). */
  contextNote: string;
  thread: ThreadMessage[];
  /** Text that clock times in a reply may legitimately come from. */
  allowedTimeText: string;
  tools: AssistantTools;
}): Promise<AssistantOutcome> {
  const usage: AssistantUsage = { model: AI_TEXT_MODEL, inputTokens: 0, outputTokens: 0 };
  const handoff = (reason: HandoffReason, summary: string): AssistantOutcome => ({
    kind: "handoff",
    reason,
    summary,
    usage,
  });

  try {
    const client = getAnthropicClient();
    const messages = toApiMessages(input.thread);
    let allowedTimeText = input.allowedTimeText;
    let booked: { service: string; local: string } | null = null;

    for (let call = 0; call < MAX_MODEL_CALLS; call += 1) {
      const response = await client.beta.messages.create({
        model: AI_TEXT_MODEL,
        max_tokens: 16000,
        output_config: { effort: "low" },
        ...(supportsServerSideFallback(AI_TEXT_MODEL)
          ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const }
          : {}),
        system: [
          { type: "text", text: input.systemPrompt, cache_control: { type: "ephemeral" } },
          { type: "text", text: input.contextNote },
        ],
        tools: TOOLS,
        messages,
      });

      usage.inputTokens +=
        response.usage.input_tokens +
        (response.usage.cache_read_input_tokens ?? 0) +
        (response.usage.cache_creation_input_tokens ?? 0);
      usage.outputTokens += response.usage.output_tokens;

      if (response.stop_reason === "refusal") {
        return handoff("error", "The AI declined to answer this message.");
      }

      const toolUses = response.content.filter((b): b is BetaToolUseBlock => b.type === "tool_use");

      if (toolUses.length === 0) {
        if (response.stop_reason !== "end_turn") {
          return handoff("error", `The AI stopped early (${response.stop_reason ?? "unknown"}).`);
        }
        const text = response.content
          .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
          .map((b) => b.text)
          .join("\n")
          .trim();
        const guard = checkReplyGuards(text, { allowedTimeText, bookedThisRun: booked !== null });
        if (!guard.ok) {
          return handoff("guard_blocked", `The AI's draft reply was blocked (${guard.reason}).`);
        }
        return { kind: "reply", text, booked, usage };
      }

      const handoffCall = toolUses.find((t) => t.name === "hand_off_to_owner");
      if (handoffCall) {
        const args = (handoffCall.input ?? {}) as Record<string, unknown>;
        const reason = MODEL_HANDOFF_REASONS.find((r) => r === args.reason) ?? "unknown_answer";
        return handoff(reason, asString(args.summary) || "The customer needs the owner.");
      }

      messages.push({ role: "assistant", content: response.content });

      const results: BetaToolResultBlockParam[] = [];
      for (const tool of toolUses) {
        const args = (tool.input ?? {}) as Record<string, unknown>;
        try {
          if (tool.name === "check_availability") {
            const result = await input.tools.checkAvailability({
              serviceName: asString(args.service_name),
              earliest: asString(args.earliest) || null,
            });
            if ("available_times" in result) {
              allowedTimeText += `\n${result.available_times.map((t) => t.local).join("\n")}`;
            }
            results.push({ type: "tool_result", tool_use_id: tool.id, content: JSON.stringify(result) });
          } else if (tool.name === "book_appointment") {
            const result = await input.tools.bookAppointment({
              serviceName: asString(args.service_name),
              startAt: asString(args.start_at),
              customerName: asString(args.customer_name),
            });
            if ("ok" in result) {
              booked = { service: result.service, local: result.local };
              allowedTimeText += `\n${result.local}`;
            }
            results.push({
              type: "tool_result",
              tool_use_id: tool.id,
              content: JSON.stringify(result),
              is_error: "error" in result,
            });
          } else {
            results.push({
              type: "tool_result",
              tool_use_id: tool.id,
              content: `Unknown tool "${tool.name}". The tools are check_availability, book_appointment and hand_off_to_owner.`,
              is_error: true,
            });
          }
        } catch (error) {
          results.push({
            type: "tool_result",
            tool_use_id: tool.id,
            content: `The tool failed: ${error instanceof Error ? error.message : "unknown error"}`,
            is_error: true,
          });
        }
      }
      messages.push({ role: "user", content: results });
    }

    return handoff("error", "The AI didn't reach an answer.");
  } catch (error) {
    const detail =
      error instanceof Anthropic.APIError
        ? `API error ${error.status ?? "unknown"}`
        : error instanceof Error
          ? error.message
          : "unknown error";
    return handoff("error", `The AI couldn't reply (${detail}).`);
  }
}
