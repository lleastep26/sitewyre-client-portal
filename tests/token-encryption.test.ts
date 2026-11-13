import { beforeEach, describe, expect, it, vi } from "vitest";

const VALID_KEY = Buffer.alloc(32, 7).toString("base64");

beforeEach(() => {
  vi.resetModules();
  vi.unstubAllEnvs();
});

describe("encryptToken / decryptToken", () => {
  it("round-trips a token", async () => {
    vi.stubEnv("CALENDAR_TOKEN_ENCRYPTION_KEY", VALID_KEY);
    const { encryptToken, decryptToken } = await import("@/lib/integrations/token-encryption");
    const encrypted = encryptToken("ya29.super-secret-access-token");
    expect(encrypted).not.toContain("ya29");
    expect(decryptToken(encrypted)).toBe("ya29.super-secret-access-token");
  });

  it("produces a different ciphertext each time (random IV)", async () => {
    vi.stubEnv("CALENDAR_TOKEN_ENCRYPTION_KEY", VALID_KEY);
    const { encryptToken } = await import("@/lib/integrations/token-encryption");
    expect(encryptToken("same-token")).not.toBe(encryptToken("same-token"));
  });

  it("throws a clear error when the key is missing", async () => {
    const { encryptToken } = await import("@/lib/integrations/token-encryption");
    expect(() => encryptToken("x")).toThrow(/CALENDAR_TOKEN_ENCRYPTION_KEY missing/);
  });

  it("throws when the key isn't a 32-byte base64 value", async () => {
    vi.stubEnv("CALENDAR_TOKEN_ENCRYPTION_KEY", Buffer.alloc(16).toString("base64"));
    const { encryptToken } = await import("@/lib/integrations/token-encryption");
    expect(() => encryptToken("x")).toThrow(/32-byte key/);
  });

  it("throws on a malformed encrypted value", async () => {
    vi.stubEnv("CALENDAR_TOKEN_ENCRYPTION_KEY", VALID_KEY);
    const { decryptToken } = await import("@/lib/integrations/token-encryption");
    expect(() => decryptToken("not-the-right-shape")).toThrow(/Malformed/);
  });
});
