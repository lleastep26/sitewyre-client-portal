import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { encryptEin, decryptEin, einLast4, maskEin } from "@/lib/a2p/encryption";

describe("EIN encryption", () => {
  beforeEach(() => {
    process.env.EIN_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
  });
  afterEach(() => {
    delete process.env.EIN_ENCRYPTION_KEY;
  });

  it("round-trips a value through encrypt/decrypt", () => {
    const encrypted = encryptEin("123456789");
    expect(encrypted).not.toContain("123456789");
    expect(decryptEin(encrypted)).toBe("123456789");
  });

  it("produces a different ciphertext each time (random IV)", () => {
    expect(encryptEin("123456789")).not.toBe(encryptEin("123456789"));
  });

  it("throws when the key is missing", () => {
    delete process.env.EIN_ENCRYPTION_KEY;
    expect(() => encryptEin("123456789")).toThrow("EIN_ENCRYPTION_KEY missing");
  });

  it("throws when the key isn't a 32-byte base64 value", () => {
    process.env.EIN_ENCRYPTION_KEY = Buffer.alloc(16).toString("base64");
    expect(() => encryptEin("123456789")).toThrow("32-byte key");
  });

  it("fails to decrypt with a different key (tamper/key-mismatch detection)", () => {
    const encrypted = encryptEin("123456789");
    process.env.EIN_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString("base64");
    expect(() => decryptEin(encrypted)).toThrow();
  });
});

describe("einLast4 / maskEin", () => {
  it("extracts the last 4 digits", () => {
    expect(einLast4("12-3456789")).toBe("6789");
  });

  it("masks consistently", () => {
    expect(maskEin("6789")).toBe("**-***6789");
  });
});
