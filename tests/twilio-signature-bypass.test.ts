import { afterEach, describe, expect, it, vi } from "vitest";
import { isLocalDevBypassAllowed } from "@/lib/twilio/validate";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("isLocalDevBypassAllowed", () => {
  it("allows the bypass in plain local dev", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("VERCEL", "");
    expect(isLocalDevBypassAllowed()).toBe(true);
  });

  it("never allows the bypass once VERCEL is set, even if NODE_ENV isn't production — the exact deployed-but-misconfigured case this closes", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("VERCEL", "1");
    expect(isLocalDevBypassAllowed()).toBe(false);
  });

  it("never allows the bypass in production locally", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL", "");
    expect(isLocalDevBypassAllowed()).toBe(false);
  });

  it("never allows the bypass in production on Vercel", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL", "1");
    expect(isLocalDevBypassAllowed()).toBe(false);
  });
});
