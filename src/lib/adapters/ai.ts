import type { AiProvider } from "./types";

export class ClaudeAiProvider implements AiProvider {
  async suggestReply(context: string): Promise<string> {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) {
      return "Thanks for reaching out — we'll get back to you shortly.";
    }
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 300,
        messages: [
          {
            role: "user",
            content: `Suggest a short SMS reply a contractor can send. Context:\n${context}`,
          },
        ],
      }),
    });
    if (!res.ok) {
      return "Thanks for reaching out — we'll get back to you shortly.";
    }
    const data = (await res.json()) as {
      content?: { type: string; text?: string }[];
    };
    return data.content?.find((c) => c.type === "text")?.text?.trim()
      ?? "Thanks for reaching out — we'll get back to you shortly.";
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
  if (process.env.ANTHROPIC_API_KEY) return new ClaudeAiProvider();
  return new FakeAiProvider();
}
