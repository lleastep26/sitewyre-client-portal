import { describe, expect, it, vi } from "vitest";

let fakeSupabase: unknown;
let state: { clickedAtUpdates: unknown[] };

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => fakeSupabase,
}));

type TableOpts = {
  singleResponse?: { data: unknown };
  onUpdate?: (patch: unknown) => void;
};

function makeTable(opts: TableOpts = {}) {
  const chain = {
    select() {
      return chain;
    },
    eq() {
      return chain;
    },
    update(patch: unknown) {
      opts.onUpdate?.(patch);
      return chain;
    },
    maybeSingle: async () => opts.singleResponse ?? { data: null },
    then(resolve: (v: { error: null }) => void) {
      resolve({ error: null });
    },
  };
  return chain;
}

function buildSupabase(opts: { linkRow: unknown; clientRow: unknown }) {
  state = { clickedAtUpdates: [] };
  return {
    from(table: string) {
      if (table === "review_links") {
        return makeTable({
          singleResponse: { data: opts.linkRow },
          onUpdate: (patch) => state.clickedAtUpdates.push(patch),
        });
      }
      if (table === "clients") {
        return makeTable({ singleResponse: { data: opts.clientRow } });
      }
      return makeTable();
    },
  };
}

const VALID_LINK = { token: "abc123", client_id: "client1", clicked_at: null };
const CLIENT = { google_review_url: "https://g.page/r/test", google_place_id: null };

describe("/r/[token] GET", () => {
  it("valid unclicked token: sets clicked_at and redirects to the review URL", async () => {
    fakeSupabase = buildSupabase({ linkRow: VALID_LINK, clientRow: CLIENT });
    const { GET } = await import("@/app/r/[token]/route");
    const res = await GET(new Request("http://localhost/r/abc123"), {
      params: Promise.resolve({ token: "abc123" }),
    });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("https://g.page/r/test");
    expect(state.clickedAtUpdates).toHaveLength(1);
  });

  it("repeat click does not overwrite clicked_at", async () => {
    fakeSupabase = buildSupabase({
      linkRow: { ...VALID_LINK, clicked_at: "2026-01-01T00:00:00Z" },
      clientRow: CLIENT,
    });
    const { GET } = await import("@/app/r/[token]/route");
    const res = await GET(new Request("http://localhost/r/abc123"), {
      params: Promise.resolve({ token: "abc123" }),
    });
    expect(res.status).toBe(302);
    expect(state.clickedAtUpdates).toHaveLength(0);
  });

  it("a known preview bot is redirected but never counts as a click", async () => {
    fakeSupabase = buildSupabase({ linkRow: VALID_LINK, clientRow: CLIENT });
    const { GET } = await import("@/app/r/[token]/route");
    const res = await GET(
      new Request("http://localhost/r/abc123", {
        headers: { "user-agent": "facebookexternalhit/1.1" },
      }),
      { params: Promise.resolve({ token: "abc123" }) },
    );
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("https://g.page/r/test");
    expect(state.clickedAtUpdates).toHaveLength(0);
  });

  it("an invalid token shows the expired page — never a redirect to home or login", async () => {
    fakeSupabase = buildSupabase({ linkRow: null, clientRow: null });
    const { GET } = await import("@/app/r/[token]/route");
    const res = await GET(new Request("http://localhost/r/doesnotexist"), {
      params: Promise.resolve({ token: "doesnotexist" }),
    });
    expect(res.status).toBe(404);
    expect(res.headers.get("location")).toBeNull();
    const text = await res.text();
    expect(text.toLowerCase()).toContain("expired");
  });
});

describe("/r/[token] HEAD", () => {
  it("never sets clicked_at, even for a valid, never-clicked token", async () => {
    fakeSupabase = buildSupabase({ linkRow: VALID_LINK, clientRow: CLIENT });
    const { HEAD } = await import("@/app/r/[token]/route");
    const res = await HEAD(
      new Request("http://localhost/r/abc123", { method: "HEAD" }),
      { params: Promise.resolve({ token: "abc123" }) },
    );
    expect(res.status).toBe(302);
    expect(state.clickedAtUpdates).toHaveLength(0);
  });
});
