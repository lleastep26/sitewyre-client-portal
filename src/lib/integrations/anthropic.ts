import Anthropic from "@anthropic-ai/sdk";

/**
 * The one place the AI text assistant's model is set. Change the default
 * here, or set AI_TEXT_MODEL in the environment to override it without a
 * code change.
 */
export const AI_TEXT_MODEL = process.env.AI_TEXT_MODEL || "claude-sonnet-5-5";

/** Models that accept the server-side refusal fallback parameter. */
export function supportsServerSideFallback(model: string): boolean {
  return /^claude-(sonnet-5-5|opus-5|fable-5)/.test(model);
}

export function hasAnthropicKey(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export function getAnthropicClient(): Anthropic {
  if (!hasAnthropicKey()) {
    throw new Error(
      "ANTHROPIC_API_KEY missing — add it to .env.local and Vercel before enabling the AI text assistant.",
    );
  }
  // Timeout is in milliseconds. Kept short so one slow call can't outlast
  // the serverless function running the Inngest step.
  return new Anthropic({ timeout: 25_000, maxRetries: 1 });
}
