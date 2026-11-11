import { describe, expect, it } from "vitest";
import { isPublicPath } from "@/lib/supabase/proxy";

describe("isPublicPath", () => {
  it("treats /r/ as public, so unauthenticated customers reach their review link", () => {
    expect(isPublicPath("/r/abc123")).toBe(true);
  });

  it("still treats the existing public prefixes as public", () => {
    expect(isPublicPath("/api/leads")).toBe(true);
    expect(isPublicPath("/book/some-site")).toBe(true);
    expect(isPublicPath("/q/token123")).toBe(true);
    expect(isPublicPath("/pay/token123")).toBe(true);
    expect(isPublicPath("/manifest.webmanifest")).toBe(true);
    expect(isPublicPath("/sw.js")).toBe(true);
  });

  it("does not treat a normal authenticated app route as public", () => {
    expect(isPublicPath("/jobs")).toBe(false);
    expect(isPublicPath("/")).toBe(false);
    expect(isPublicPath("/admin")).toBe(false);
  });
});
