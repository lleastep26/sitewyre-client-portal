import { beforeEach, describe, expect, it, vi } from "vitest";

const ingestLead = vi.fn();
const answerChatMessage = vi.fn();

vi.mock("@/lib/leads/ingest", () => ({ ingestLead }));
vi.mock("@/lib/chat-widget/conversation", () => ({ answerChatMessage }));

type Row = Record<string, unknown>;
let clientRow: Row | null;
let sessionRow: Row | null;
let sessionsFromIp: number;
let sessionsInserted: Row[];
let lastClientLookup: [string, string] | null;

const fakeSupabase = {
  from(table: string) {
    if (table === "clients") {
      return {
        select: () => ({
          eq: (col: string, value: string) => {
            lastClientLookup = [col, value];
            return { maybeSingle: async () => ({ data: clientRow }) };
          },
        }),
      };
    }
    if (table === "contacts") {
      return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { name: "Jo" } }) }) }) };
    }
    if (table === "chat_sessions") {
      return {
        select: (_cols?: string, opts?: { head?: boolean }) => {
          if (opts?.head) return { eq: () => ({ gte: async () => ({ count: sessionsFromIp }) }) };
          return { eq: () => ({ maybeSingle: async () => ({ data: sessionRow }) }) };
        },
        insert: (row: Row) => {
          sessionsInserted.push(row);
          return {
            select: () => ({
              single: async () => ({
                data: {
                  id: "sess1",
                  contact_id: row.contact_id,
                  lead_id: row.lead_id,
                  created_at: "2026-11-13T15:00:00.000Z",
                  owner_alerted_at: null,
                  visitor_message_count: 0,
                },
                error: null,
              }),
            }),
          };
        },
      };
    }
    throw new Error(`unexpected table ${table}`);
  },
};
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => fakeSupabase }));

const SITE = "https://acme-plumbing.com";

function postJson(path: string, body: unknown, origin: string | null = SITE) {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": "203.0.113.5",
      ...(origin ? { origin } : {}),
    },
    body: JSON.stringify(body),
  });
}

const startBody = { site_key: "abc", name: "Jo", phone: "512-555-0100", message: "My water heater is leaking" };

beforeEach(() => {
  vi.clearAllMocks();
  clientRow = {
    id: "client1",
    business_name: "Acme Plumbing",
    brand_colors: { primary: "#123abc" },
    chat_widget_enabled: true,
    domain: "acme-plumbing.com",
    live_site_url: null,
    site_key: "abc",
  };
  sessionRow = null;
  sessionsFromIp = 0;
  sessionsInserted = [];
  ingestLead.mockResolvedValue({ leadId: "lead1", contactId: "contact1" });
  answerChatMessage.mockResolvedValue({ reply: "Thanks Jo — the team has your request." });
});

describe("GET /api/public/chat/config", () => {
  async function config(siteKey = "abc") {
    const { GET } = await import("@/app/api/public/chat/config/route");
    const res = await GET(new Request(`http://localhost/api/public/chat/config?site_key=${siteKey}`));
    return res.json();
  }

  it("returns what the widget needs when it's on", async () => {
    const json = await config();
    expect(json).toMatchObject({ enabled: true, business_name: "Acme Plumbing", color: "#123abc" });
    expect(json.consent_text).toContain("Reply STOP to opt out");
  });

  it("never hands the script a Turnstile key, even when the keys are set", async () => {
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "site-key");
    vi.stubEnv("TURNSTILE_SECRET_KEY", "secret-key");
    try {
      const json = await config();
      expect(json.enabled).toBe(true);
      expect(json).not.toHaveProperty("turnstile_site_key");
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("finds the business by the page's domain when the tag has no site key", async () => {
    const { GET } = await import("@/app/api/public/chat/config/route");
    const res = await GET(new Request("http://localhost/api/public/chat/config?domain=www.acme-plumbing.com"));
    const json = await res.json();
    expect(lastClientLookup).toEqual(["domain", "acme-plumbing.com"]);
    expect(json).toMatchObject({ enabled: true, site_key: "abc" });
  });

  it("returns only enabled: false when the widget is off or the key is unknown", async () => {
    clientRow = { ...clientRow, chat_widget_enabled: false };
    // Chat off: no chat details, but the script still learns the site key
    // and whether to capture forms.
    expect(await config()).toEqual({ enabled: false, capture: false, site_key: "abc" });
    clientRow = { ...clientRow, form_capture_enabled: true };
    expect(await config()).toEqual({ enabled: false, capture: true, site_key: "abc" });
    clientRow = null;
    expect(await config("nope")).toEqual({ enabled: false, capture: false });
  });

  it("ignores a brand colour that isn't a plain hex value", async () => {
    clientRow = { ...clientRow, brand_colors: { primary: "red;background:url(x)" } };
    expect((await config()).color).toBeNull();
  });
});

describe("POST /api/public/chat/start", () => {
  async function start(body: unknown = startBody, origin: string | null = SITE) {
    const { POST } = await import("@/app/api/public/chat/start/route");
    return POST(postJson("/api/public/chat/start", body, origin));
  }

  it("creates the lead immediately, opens a session, and answers the first message", async () => {
    const res = await start();
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.reply).toBe("Thanks Jo — the team has your request.");
    expect(json.session_token).toHaveLength(64);

    expect(ingestLead).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ id: "client1" }),
      expect.objectContaining({ name: "Jo", message: "My water heater is leaking", source: "chat_widget" }),
    );
    // Only the token's hash is stored.
    expect(sessionsInserted[0]).toMatchObject({ client_id: "client1", contact_id: "contact1", lead_id: "lead1" });
    expect(sessionsInserted[0]!.token_hash).not.toBe(json.session_token);
    expect(sessionsInserted[0]!.ip_hash).not.toContain("203.0.113.5");
  });

  it("rejects a bot that fills in the hidden field", async () => {
    const res = await start({ ...startBody, website: "http://spam.example" });
    expect(res.status).toBe(400);
    expect(ingestLead).not.toHaveBeenCalled();
  });

  it("rejects when the widget is off", async () => {
    clientRow = { ...clientRow, chat_widget_enabled: false };
    expect((await start()).status).toBe(403);
    expect(ingestLead).not.toHaveBeenCalled();
  });

  it("rejects a request from another website", async () => {
    expect((await start(startBody, "https://evil.example")).status).toBe(403);
    expect((await start(startBody, null)).status).toBe(403);
    expect(ingestLead).not.toHaveBeenCalled();
  });

  it("rate-limits new chats per IP address", async () => {
    sessionsFromIp = 5;
    expect((await start()).status).toBe(429);
    expect(ingestLead).not.toHaveBeenCalled();
  });

  it("starts a chat with no Turnstile answer even when the Turnstile keys are set", async () => {
    // The chat runs on the client's own website, where Sitewyre's
    // Turnstile widget can't. Cloudflare must never be asked.
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "site-key");
    vi.stubEnv("TURNSTILE_SECRET_KEY", "secret-key");
    const fetchSpy = vi.fn(() => Promise.reject(new Error("Cloudflare must not be called")));
    vi.stubGlobal("fetch", fetchSpy);
    try {
      const res = await start();
      expect(res.status).toBe(200);
      expect(ingestLead).toHaveBeenCalledTimes(1);
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
      vi.unstubAllEnvs();
    }
  });

  it("rejects a missing name, phone or message", async () => {
    expect((await start({ site_key: "abc", name: "Jo", phone: "", message: "hi" })).status).toBe(400);
  });
});

describe("POST /api/public/chat/message", () => {
  const token = "a".repeat(64);

  async function send(message = "Do you service Round Rock?", origin: string | null = SITE) {
    const { POST } = await import("@/app/api/public/chat/message/route");
    return POST(postJson("/api/public/chat/message", { session_token: token, message }, origin));
  }

  beforeEach(() => {
    sessionRow = {
      id: "sess1",
      client_id: "client1",
      contact_id: "contact1",
      lead_id: "lead1",
      created_at: "2026-11-13T15:00:00.000Z",
      owner_alerted_at: null,
      visitor_message_count: 3,
      last_message_at: new Date(Date.now() - 60_000).toISOString(),
    };
  });

  it("answers a follow-on message", async () => {
    const res = await send();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ reply: "Thanks Jo — the team has your request." });
    expect(answerChatMessage).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ visitorName: "Jo", visitorMessage: "Do you service Round Rock?" }),
    );
  });

  it("rejects an unknown session token", async () => {
    sessionRow = null;
    expect((await send()).status).toBe(404);
  });

  it("stops at the per-conversation message limit", async () => {
    sessionRow = { ...sessionRow, visitor_message_count: 30 };
    expect((await send()).status).toBe(429);
    expect(answerChatMessage).not.toHaveBeenCalled();
  });

  it("rejects messages sent too quickly", async () => {
    sessionRow = { ...sessionRow, last_message_at: new Date().toISOString() };
    expect((await send()).status).toBe(429);
    expect(answerChatMessage).not.toHaveBeenCalled();
  });

  it("rejects a message over 500 characters", async () => {
    expect((await send("x".repeat(501))).status).toBe(400);
  });

  it("rejects a request from another website", async () => {
    expect((await send("hi", "https://evil.example")).status).toBe(403);
  });
});
