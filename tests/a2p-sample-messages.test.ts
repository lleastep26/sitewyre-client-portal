import { describe, expect, it } from "vitest";
import { buildSampleMessages, buildMessageFlow } from "@/lib/a2p/sample-messages";

describe("buildSampleMessages", () => {
  it("includes the business name and opt-out line in every sample", () => {
    const samples = buildSampleMessages("Acme Cleaning");
    expect(samples.length).toBeGreaterThanOrEqual(2);
    for (const s of samples) {
      expect(s).toContain("Acme Cleaning");
      expect(s).toContain("Reply STOP to opt out");
    }
  });

  it("falls back gracefully for an empty business name", () => {
    const samples = buildSampleMessages("");
    expect(samples[0]).toContain("our business");
    expect(samples[0]).toContain("Reply STOP to opt out");
  });
});

describe("buildMessageFlow", () => {
  it("references the website and opt-out", () => {
    const flow = buildMessageFlow("https://acme.com");
    expect(flow).toContain("https://acme.com");
    expect(flow).toContain("STOP");
  });

  it("falls back when there's no website", () => {
    const flow = buildMessageFlow(null);
    expect(flow).toContain("the business's website");
  });
});
