import { afterEach, describe, expect, it, vi } from "vitest";
import { checkWebsiteReachable } from "@/lib/a2p/website-check";

const originalFetch = global.fetch;

describe("checkWebsiteReachable", () => {
  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("returns true for a 200 response", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    expect(await checkWebsiteReachable("example.com")).toBe(true);
    expect(global.fetch).toHaveBeenCalledWith(
      "https://example.com",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("respects an already-prefixed protocol", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    await checkWebsiteReachable("http://example.com");
    expect(global.fetch).toHaveBeenCalledWith(
      "http://example.com",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("returns false for a non-ok response", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 });
    expect(await checkWebsiteReachable("example.com")).toBe(false);
  });

  it("returns false when the fetch throws (DNS failure, timeout, etc.)", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("ENOTFOUND"));
    expect(await checkWebsiteReachable("example.com")).toBe(false);
  });
});
