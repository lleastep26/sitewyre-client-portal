import { describe, expect, it } from "vitest";
import { getBearerToken } from "@/lib/auth/bearer";

describe("getBearerToken", () => {
  it("reads Bearer tokens", () => {
    const req = new Request("https://example.com", {
      headers: { Authorization: "Bearer abc.def" },
    });
    expect(getBearerToken(req)).toBe("abc.def");
  });

  it("returns null when missing or malformed", () => {
    expect(getBearerToken(new Request("https://example.com"))).toBeNull();
    expect(
      getBearerToken(
        new Request("https://example.com", {
          headers: { Authorization: "Basic x" },
        }),
      ),
    ).toBeNull();
  });
});
