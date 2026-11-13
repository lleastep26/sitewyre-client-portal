import Anthropic from "@anthropic-ai/sdk";
import {
  AI_TEXT_MODEL,
  getAnthropicClient,
  hasAnthropicKey,
  supportsServerSideFallback,
} from "@/lib/integrations/anthropic";
import type { AiProvider } from "./types";

const FALLBACK_SUGGESTION = "Thanks for reaching out — we'll get back to you shortly.";

export class ClaudeAiProvider implements AiProvider {
  /** The inbox "AI suggest" button. Uses the same model setting as the AI
   * text assistant (AI_TEXT_MODEL); the owner reviews and sends the draft. */
  async suggestReply(context: string): Promise<string> {
    if (!hasAnthropicKey()) return FALLBACK_SUGGESTION;
    try {
      const response = await getAnthropicClient().beta.messages.create({
        model: AI_TEXT_MODEL,
        max_tokens: 16000,
        output_config: { effort: "low" },
        ...(supportsServerSideFallback(AI_TEXT_MODEL)
          ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const }
          : {}),
        system:
          "You draft short SMS replies for a home-service contractor to send to a customer. Reply with the message text only: plain text, under 300 characters, no quotes around it, no prices or promised times that aren't in the conversation.",
        messages: [{ role: "user", content: `Draft the contractor's next reply. Conversation so far:\n${context}` }],
      });
      if (response.stop_reason === "refusal") return FALLBACK_SUGGESTION;
      const text = response.content
        .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();
      return text || FALLBACK_SUGGESTION;
    } catch {
      return FALLBACK_SUGGESTION;
    }
  }

  async summarize(text: string): Promise<string> {
    return text.slice(0, 280);
  }
}

export class FakeAiProvider implements AiProvider {
  async suggestReply(context: string) {
    void context;
    return "Thanks for your message — when works best for a visit?";
  }
  async summarize(text: string) {
    return text.slice(0, 140);
  }
}

export function getAiProvider(): AiProvider {
  if (hasAnthropicKey()) return new ClaudeAiProvider();
  return new FakeAiProvider();
}
