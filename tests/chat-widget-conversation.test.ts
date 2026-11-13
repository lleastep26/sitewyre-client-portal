import { beforeEach, describe, expect, it, vi } from "vitest";

const runChatAssistant = vi.fn();
const ownerSms = vi.fn();
const sendPushToClient = vi.fn();

vi.mock("@/lib/chat-widget/assistant", () => ({ runChatAssistant }));
vi.mock("@/lib/adapters", () => ({ getSmsProvider: () => ({ send: ownerSms }) }));
vi.mock("@/lib/a2p/sending", () => ({ resolveSmsFrom: () => "+15555550100" }));
vi.mock("@/lib/push/web-push", () => ({ sendPushToClient }));
vi.mock("@/lib/business-knowledge/load", () => ({
  loadBusinessKnowledgeParts: async () => ({ bookableServices: [], availability: [], faqs: [] }),
}));
vi.mock("@/lib/integrations/anthropic", () => ({ AI_CHAT_MODEL: "claude-sonnet-5-5" }));

type Row = Record<string, unknown>;
let inserted: Record<string, Row[]>;
let updated: Record<string, Row[]>;
let repliesToday: number;

function chainFor(table: string) {
  const chain: Record<string, unknown> = {
    select: (_cols?: string, opts?: { head?: boolean }) => {
      if (opts?.head) {
        const counter: Record<string, unknown> = {
          eq: () => counter,
          gte: () => Promise.resolve({ count: repliesToday }),
        };
        return counter;
      }
      return chain;
    },
    eq: () => chain,
    gte: () => chain,
    order: () => chain,
    limit: async () => ({ data: (inserted.messages ?? []).map((m) => ({ direction: m.direction, body: m.body })) }),
    insert: (row: Row) => {
      (inserted[table] ??= []).push(row);
      return Promise.resolve({ error: null });
    },
    update: (patch: Row) => {
      (updated[table] ??= []).push(patch);
      return { eq: async () => ({ error: null }) };
    },
  };
  return chain;
}
const supabase = { from: (table: string) => chainFor(table) };

const client = {
  id: "client1",
  business_name: "Acme",
  phone: "+15129998888",
  timezone: "America/Chicago",
  site_key: "abc",
  ai_chat_replies_used_this_month: 4,
};
const session = {
  id: "sess1",
  contact_id: "contact1",
  lead_id: "lead1",
  created_at: "2026-11-13T15:00:00.000Z",
  owner_alerted_at: null as string | null,
  visitor_message_count: 0,
};

async function answer(overrides: Partial<typeof session> = {}, message = "Do you service Round Rock?") {
  const { answerChatMessage } = await import("@/lib/chat-widget/conversation");
  return answerChatMessage(supabase as never, {
    client: client as never,
    session: { ...session, ...overrides },
    visitorName: "Jo",
    visitorMessage: message,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  inserted = {};
  updated = {};
  repliesToday = 0;
  ownerSms.mockResolvedValue({ id: "SM1", status: "sent" });
  sendPushToClient.mockResolvedValue(undefined);
  runChatAssistant.mockResolvedValue({ kind: "reply", text: "Yes, we do.", inputTokens: 50, outputTokens: 10 });
});

describe("answerChatMessage", () => {
  it("saves both sides of the chat to the lead's thread, marks the reply as AI, and counts it", async () => {
    const result = await answer();
    expect(result).toEqual({ reply: "Yes, we do." });
    expect(inserted.messages).toEqual([
      expect.objectContaining({ channel: "chat", direction: "inbound", body: "Do you service Round Rock?", contact_id: "contact1" }),
      expect.objectContaining({ channel: "chat", direction: "outbound", body: "Yes, we do.", ai_generated: true }),
    ]);
    expect(updated.clients).toEqual([{ ai_chat_replies_used_this_month: 5 }]);
    expect(updated.chat_sessions?.[0]).toMatchObject({ visitor_message_count: 1 });
    expect(inserted.workflow_runs?.[0]).toMatchObject({
      trigger: "chat_widget",
      status: "reply",
      log: expect.objectContaining({ leadId: "lead1", inputTokens: 50, outputTokens: 10 }),
    });
    expect(ownerSms).not.toHaveBeenCalled();
  });

  it("gives the model the booking page link, not a booking tool", async () => {
    await answer();
    const input = runChatAssistant.mock.calls[0][0];
    expect(input.contextNote).toContain("/book/abc");
    expect(input.history.at(-1)).toEqual({ role: "visitor", body: "Do you service Round Rock?" });
  });

  it("tells the visitor the team will follow up and alerts the owner when the AI isn't sure", async () => {
    runChatAssistant.mockResolvedValue({ kind: "follow_up", summary: "Asked for a price.", inputTokens: 1, outputTokens: 1 });
    const result = await answer({}, "How much is a water heater?");
    expect(result.reply).toContain("someone will follow up");
    expect(ownerSms).toHaveBeenCalledTimes(1);
    expect(ownerSms.mock.calls[0][0].body).toContain("How much is a water heater?");
    expect(updated.chat_sessions).toContainEqual({ owner_alerted_at: expect.any(String) });
  });

  it("alerts the owner only once per conversation", async () => {
    runChatAssistant.mockResolvedValue({ kind: "follow_up", summary: "x", inputTokens: 1, outputTokens: 1 });
    await answer({ owner_alerted_at: "2026-11-13T15:05:00.000Z" });
    expect(ownerSms).not.toHaveBeenCalled();
  });

  it("stops calling the model once the client's daily reply cap is reached", async () => {
    repliesToday = 200;
    const result = await answer();
    expect(runChatAssistant).not.toHaveBeenCalled();
    expect(result.reply).toContain("someone will follow up");
  });
});
