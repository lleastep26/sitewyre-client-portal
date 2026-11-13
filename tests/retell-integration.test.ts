import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sign } from "retell-sdk";
import { retellSipUri, spokenCallerNumber, verifyRetellSignature } from "@/lib/integrations/retell";

beforeEach(() => {
  vi.unstubAllEnvs();
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("spokenCallerNumber", () => {
  it("formats a US number so the agent can read it back", () => {
    expect(spokenCallerNumber("+14055550123")).toBe("405-555-0123");
    expect(spokenCallerNumber("4055550123")).toBe("405-555-0123");
  });

  it("says unknown for withheld or non-US caller ID", () => {
    expect(spokenCallerNumber("anonymous")).toBe("unknown");
    expect(spokenCallerNumber("+266696687")).toBe("unknown");
    expect(spokenCallerNumber("+442071234567")).toBe("unknown");
  });
});

describe("retellSipUri", () => {
  it("builds the dial-to-SIP-URI handoff target", () => {
    expect(retellSipUri("call_abc123")).toBe("sip:call_abc123@sip.retellai.com;transport=tcp");
  });
});

describe("verifyRetellSignature", () => {
  it("returns false when RETELL_API_KEY is missing", async () => {
    const ok = await verifyRetellSignature("{}", "v=1,d=abc");
    expect(ok).toBe(false);
  });

  it("returns false when the signature header is missing", async () => {
    vi.stubEnv("RETELL_API_KEY", "test-key");
    const ok = await verifyRetellSignature("{}", null);
    expect(ok).toBe(false);
  });

  it("returns true for a signature produced with the same key", async () => {
    vi.stubEnv("RETELL_API_KEY", "test-key");
    const body = JSON.stringify({ name: "check_availability", args: {} });
    const signature = await sign(body, "test-key");
    const ok = await verifyRetellSignature(body, signature);
    expect(ok).toBe(true);
  });

  it("returns false for a signature produced with a different key", async () => {
    vi.stubEnv("RETELL_API_KEY", "test-key");
    const body = JSON.stringify({ name: "check_availability", args: {} });
    const signature = await sign(body, "wrong-key");
    const ok = await verifyRetellSignature(body, signature);
    expect(ok).toBe(false);
  });

  it("returns false when the body has been tampered with after signing", async () => {
    vi.stubEnv("RETELL_API_KEY", "test-key");
    const signature = await sign(JSON.stringify({ name: "a" }), "test-key");
    const ok = await verifyRetellSignature(JSON.stringify({ name: "b" }), signature);
    expect(ok).toBe(false);
  });
});
