import { afterEach, describe, expect, it, vi } from "vitest";
import { hashIp, hashToken, isAllowedChatOrigin, newSessionToken } from "@/lib/chat-widget/limits";

afterEach(() => {
  vi.unstubAllEnvs();
});

const client = { domain: "acme-plumbing.com", live_site_url: "https://www.acme-plumbing.com/" };

describe("isAllowedChatOrigin", () => {
  it("allows the client's own site, with or without www", () => {
    expect(isAllowedChatOrigin("https://acme-plumbing.com", client)).toBe(true);
    expect(isAllowedChatOrigin("https://www.acme-plumbing.com", client)).toBe(true);
  });

  it("rejects any other site", () => {
    expect(isAllowedChatOrigin("https://evil.example", client)).toBe(false);
    expect(isAllowedChatOrigin("https://acme-plumbing.com.evil.example", client)).toBe(false);
  });

  it("rejects a request with no Origin header", () => {
    expect(isAllowedChatOrigin(null, client)).toBe(false);
  });

  it("allows the portal's own origin, for previews", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://portal.example");
    expect(isAllowedChatOrigin("https://portal.example", client)).toBe(true);
  });

  it("allows localhost outside production only", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://portal.example");
    vi.stubEnv("NODE_ENV", "test");
    expect(isAllowedChatOrigin("http://localhost:3000", client)).toBe(true);
    vi.stubEnv("NODE_ENV", "production");
    expect(isAllowedChatOrigin("http://localhost:3000", client)).toBe(false);
  });
});

describe("tokens and hashes", () => {
  it("issues long random tokens and stores only a stable hash", () => {
    const a = newSessionToken();
    const b = newSessionToken();
    expect(a).toHaveLength(64);
    expect(a).not.toBe(b);
    expect(hashToken(a)).toBe(hashToken(a));
    expect(hashToken(a)).not.toContain(a);
  });

  it("hashes IPs with a salt", () => {
    vi.stubEnv("INTERNAL_API_SECRET", "s1");
    const one = hashIp("203.0.113.5");
    vi.stubEnv("INTERNAL_API_SECRET", "s2");
    expect(hashIp("203.0.113.5")).not.toBe(one);
  });
});
