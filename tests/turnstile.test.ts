import { afterEach, describe, expect, it, vi } from "vitest";
import { verifyTurnstileToken } from "@/lib/security/turnstile";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("verifyTurnstileToken", () => {
  it("skips when secret is unset", async () => {
    vi.stubEnv("TURNSTILE_SECRET_KEY", "");
    const result = await verifyTurnstileToken(undefined);
    expect(result).toEqual({ ok: true, skipped: true });
  });

  it("rejects missing token when secret is set", async () => {
    vi.stubEnv("TURNSTILE_SECRET_KEY", "test-secret");
    const result = await verifyTurnstileToken("");
    expect(result.ok).toBe(false);
  });

  it("accepts successful siteverify", async () => {
    vi.stubEnv("TURNSTILE_SECRET_KEY", "test-secret");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        json: async () => ({ success: true }),
      }),
    );
    const result = await verifyTurnstileToken("token-abc");
    expect(result).toEqual({ ok: true });
  });
});
