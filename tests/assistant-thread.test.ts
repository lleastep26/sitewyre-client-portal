import { beforeEach, describe, expect, it, vi } from "vitest";

const sendFunnelMessage = vi.fn();
const findOpenLeadForPhone = vi.fn();
const isOptedOut = vi.fn();
const runTextAssistant = vi.fn();
const ownerSms = vi.fn();
const sendPushToClient = vi.fn();

vi.mock("@/lib/funnels/send", () => ({ sendFunnelMessage }));
vi.mock("@/lib/leads/lifecycle", () => ({ findOpenLeadForPhone }));
vi.mock("@/lib/funnels/opt-out", () => ({ isOptedOut }));
vi.mock("@/lib/assistant/text-assistant", () => ({ runTextAssistant }));
vi.mock("@/lib/adapters", () => ({ getSmsProvider: () => ({ send: ownerSms }) }));
vi.mock("@/lib/push/web-push", () => ({ sendPushToClient }));
vi.mock("@/lib/a2p/sending", () => ({
  resolveSmsFrom: () => "+15555550100",
  resolveOwnerAlertFrom: () => undefined,
}));
vi.mock("@/lib/business-knowledge/load", () => ({
  loadBusinessKnowledgeParts: async () => ({ bookableServices: [], availability: [], faqs: [] }),
}));

type Row = Record<string, unknown>;
let clientRow: Row | null;
let contactRow: Row | null;
let messageRows: Row[];
let clientUpdates: Row[];
let contactUpdates: Row[];
let handedBackAt: string | null;

function fakeSupabase() {
  return {
    from(table: string) {
      if (table === "clients") {
        return {
          select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: clientRow }) }) }),
          update: (patch: Row) => ({
            eq: async () => {
              clientUpdates.push(patch);
              return { error: null };
            },
          }),
        };
      }
      if (table === "contacts") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({ maybeSingle: async () => ({ data: contactRow }) }),
              maybeSingle: async () => ({ data: contactRow }),
            }),
          }),
          update: (patch: Row) => ({
            eq: async () => {
              contactUpdates.push(patch);
              return { error: null };
            },
          }),
        };
      }
      if (table === "messages") {
        const chain = {
          select: () => chain,
          eq: () => chain,
          order: () => chain,
          // Newest first, like the real query.
          limit: async () => ({ data: [...messageRows].reverse() }),
        };
        return chain;
      }
      if (table === "activities") {
        const chain = {
          select: () => chain,
          eq: () => chain,
          order: () => chain,
          limit: () => chain,
          maybeSingle: async () => ({ data: handedBackAt ? { occurred_at: handedBackAt } : null }),
        };
        return chain;
      }
      if (table === "leads") {
        return {
          select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { message: "Clogged kitchen drain" } }) }) }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
}

const ids = { clientId: "client1", contactId: "contact1", messageSid: "SM2" };

function msg(direction: string, body: string, extra: Row = {}): Row {
  return { direction, body, external_id: null, ai_generated: false, created_at: "2026-11-13T15:00:00.000Z", ...extra };
}

beforeEach(() => {
  vi.clearAllMocks();
  clientUpdates = [];
  contactUpdates = [];
  handedBackAt = null;
  clientRow = {
    id: "client1",
    business_name: "Acme",
    phone: "+15129998888",
    timezone: "America/Chicago",
    twilio_phone_number: "+15555550100",
    a2p_status: "approved",
    ai_text_assistant_enabled: true,
    ai_text_replies_used_this_month: 7,
  };
  contactRow = { id: "contact1", name: "Jo", phones: ["+15551234567"], ai_paused_at: null };
  messageRows = [
    msg("outbound", "Hi Jo, thanks for contacting Acme."),
    msg("inbound", "Do you do drain cleaning?", { external_id: "SM2" }),
  ];
  findOpenLeadForPhone.mockResolvedValue({ id: "lead1", name: "Jo", contact_id: "contact1" });
  isOptedOut.mockResolvedValue(false);
  sendFunnelMessage.mockResolvedValue({ status: "sent", sid: "SM_out" });
  ownerSms.mockResolvedValue({ id: "SM_owner", status: "sent" });
  sendPushToClient.mockResolvedValue(undefined);
});

describe("aiReplySendTime", () => {
  const TZ = "America/Chicago";

  it("sends right away at any hour when the lead texted within 15 minutes", async () => {
    const { aiReplySendTime } = await import("@/lib/assistant/thread");
    const now = new Date("2026-11-14T08:00:00.000Z"); // 2am Chicago
    const lastInbound = new Date(now.getTime() - 5 * 60_000);
    expect(aiReplySendTime(lastInbound, now, TZ)).toEqual(now);
  });

  it("holds until 8am when the reply would go out more than 15 minutes later, at night", async () => {
    const { aiReplySendTime } = await import("@/lib/assistant/thread");
    const now = new Date("2026-11-14T08:00:00.000Z"); // 2am Chicago
    const lastInbound = new Date(now.getTime() - 16 * 60_000);
    const sendAt = aiReplySendTime(lastInbound, now, TZ);
    expect(sendAt.toISOString()).toBe("2026-11-14T14:00:00.000Z"); // 8am Chicago
  });

  it("sends right away in the daytime even when the text is older", async () => {
    const { aiReplySendTime } = await import("@/lib/assistant/thread");
    const now = new Date("2026-11-13T20:00:00.000Z"); // 2pm Chicago
    const lastInbound = new Date(now.getTime() - 60 * 60_000);
    expect(aiReplySendTime(lastInbound, now, TZ)).toEqual(now);
  });
});

describe("loadAiTextContext", () => {
  async function load() {
    const { loadAiTextContext } = await import("@/lib/assistant/thread");
    return loadAiTextContext(fakeSupabase() as never, ids);
  }

  it("returns the thread when every gate passes", async () => {
    const ctx = await load();
    expect(ctx).toMatchObject({
      contact: { id: "contact1", name: "Jo", phone: "+15551234567" },
      lead: { id: "lead1" },
      leadMessage: "Clogged kitchen drain",
      lastInboundBody: "Do you do drain cleaning?",
      aiReplyCount: 0,
    });
  });

  it("skips when the assistant is off", async () => {
    clientRow = { ...clientRow, ai_text_assistant_enabled: false };
    expect(await load()).toEqual({ skip: "disabled" });
  });

  it("skips when the owner has taken the thread over", async () => {
    contactRow = { ...contactRow, ai_paused_at: "2026-11-13T10:00:00.000Z" };
    expect(await load()).toEqual({ skip: "paused" });
  });

  it("skips when there is no open lead (already booked, lost, or not a lead)", async () => {
    findOpenLeadForPhone.mockResolvedValue(null);
    expect(await load()).toEqual({ skip: "no_open_lead" });
  });

  it("skips an opted-out number", async () => {
    isOptedOut.mockResolvedValue(true);
    expect(await load()).toEqual({ skip: "opted_out" });
  });

  it("skips when A2P isn't approved", async () => {
    clientRow = { ...clientRow, a2p_status: "pending" };
    expect(await load()).toEqual({ skip: "a2p_pending" });
  });

  it("skips when a newer text has arrived (that text's own job answers both)", async () => {
    messageRows.push(msg("inbound", "Also, are you open Saturday?", { external_id: "SM3" }));
    expect(await load()).toEqual({ skip: "newer_message" });
  });

  it("skips when someone already answered", async () => {
    messageRows.push(msg("outbound", "Yes we do!"));
    expect(await load()).toEqual({ skip: "already_answered" });
  });

  it("counts AI replies since the owner last texted", async () => {
    messageRows = [
      msg("outbound", "Owner here."),
      msg("inbound", "q1"),
      msg("outbound", "a1", { ai_generated: true }),
      msg("inbound", "q2"),
      msg("outbound", "a2", { ai_generated: true }),
      msg("inbound", "q3", { external_id: "SM2" }),
    ];
    expect(await load()).toMatchObject({ aiReplyCount: 2 });
  });

  it("starts the count again when the owner hands the thread back to the AI", async () => {
    messageRows = [
      msg("outbound", "a1", { ai_generated: true, created_at: "2026-11-13T15:00:00.000Z" }),
      msg("inbound", "q2", { created_at: "2026-11-13T15:01:00.000Z" }),
      msg("outbound", "a2", { ai_generated: true, created_at: "2026-11-13T15:02:00.000Z" }),
      msg("inbound", "q3", { created_at: "2026-11-13T16:01:00.000Z" }),
      msg("outbound", "a3", { ai_generated: true, created_at: "2026-11-13T16:02:00.000Z" }),
      msg("inbound", "q4", { external_id: "SM2", created_at: "2026-11-13T16:03:00.000Z" }),
    ];
    handedBackAt = "2026-11-13T16:00:00.000Z";
    expect(await load()).toMatchObject({ aiReplyCount: 1 });
  });
});

describe("generateAiTextReply", () => {
  async function generate(overrides: Row = {}) {
    const { loadAiTextContext, generateAiTextReply } = await import("@/lib/assistant/thread");
    const ctx = await loadAiTextContext(fakeSupabase() as never, ids);
    if ("skip" in ctx) throw new Error(`unexpected skip ${ctx.skip}`);
    return generateAiTextReply(fakeSupabase() as never, { ...ctx, ...overrides });
  }

  it("hands off an emergency without calling the model", async () => {
    const outcome = await generate({ lastInboundBody: "My basement is flooding" });
    expect(outcome).toMatchObject({ kind: "handoff", reason: "emergency" });
    expect(runTextAssistant).not.toHaveBeenCalled();
  });

  it("hands off a request for a person without calling the model", async () => {
    const outcome = await generate({ lastInboundBody: "Can I talk to a person?" });
    expect(outcome).toMatchObject({ kind: "handoff", reason: "wants_person" });
    expect(runTextAssistant).not.toHaveBeenCalled();
  });

  it("hands off after eight AI replies without a booking", async () => {
    const outcome = await generate({ aiReplyCount: 8 });
    expect(outcome).toMatchObject({ kind: "handoff", reason: "reply_cap" });
    expect(runTextAssistant).not.toHaveBeenCalled();
  });

  it("otherwise asks the model, with the business knowledge and the thread", async () => {
    runTextAssistant.mockResolvedValue({
      kind: "reply",
      text: "Yes, we do.",
      booked: null,
      usage: { model: "claude-sonnet-5-5", inputTokens: 1, outputTokens: 1 },
    });
    const outcome = await generate();
    expect(outcome).toMatchObject({ kind: "reply", text: "Yes, we do." });
    const input = runTextAssistant.mock.calls[0][0];
    expect(input.systemPrompt).toContain("Business: Acme");
    expect(input.contextNote).toContain("Clogged kitchen drain");
    expect(input.thread.at(-1)).toEqual({ direction: "inbound", body: "Do you do drain cleaning?" });
  });
});

describe("sendAiText", () => {
  it("sends through the normal checks, marks the message as AI, and counts it", async () => {
    const { sendAiText } = await import("@/lib/assistant/thread");
    const sent = await sendAiText(fakeSupabase() as never, {
      client: clientRow as never,
      contactId: "contact1",
      to: "+15551234567",
      body: "Yes, we do.",
    });
    expect(sent).toBe(true);
    expect(sendFunnelMessage).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ trigger: "ai_text_reply", aiGenerated: true, contactId: "contact1" }),
    );
    expect(clientUpdates).toEqual([{ ai_text_replies_used_this_month: 8 }]);
  });

  it("doesn't count a text that was blocked", async () => {
    sendFunnelMessage.mockResolvedValue({ status: "skipped", reason: "opted_out" });
    const { sendAiText } = await import("@/lib/assistant/thread");
    const sent = await sendAiText(fakeSupabase() as never, {
      client: clientRow as never,
      contactId: "contact1",
      to: "+15551234567",
      body: "Yes, we do.",
    });
    expect(sent).toBe(false);
    expect(clientUpdates).toHaveLength(0);
  });
});

describe("handOffToOwner", () => {
  async function handOff(reason: "emergency" | "unknown_answer") {
    const { handOffToOwner } = await import("@/lib/assistant/thread");
    await handOffToOwner(fakeSupabase() as never, {
      client: clientRow as never,
      contact: { id: "contact1", name: "Jo", phone: "+15551234567" },
      reason,
      lastInboundBody: "How much is a water heater?",
    });
  }

  it("pauses the AI, sends one holding text, and alerts the owner", async () => {
    await handOff("unknown_answer");
    expect(contactUpdates).toContainEqual(
      expect.objectContaining({ ai_paused_reason: "unknown_answer", ai_paused_at: expect.any(String) }),
    );
    expect(sendFunnelMessage).toHaveBeenCalledTimes(1);
    expect(sendFunnelMessage.mock.calls[0][1].body).toContain("passing this to the team");
    expect(ownerSms).toHaveBeenCalledWith(
      expect.objectContaining({ to: "+15129998888", body: expect.stringContaining("How much is a water heater?") }),
    );
    expect(sendPushToClient).toHaveBeenCalledTimes(1);
  });

  it("marks an emergency urgent and tells the customer to call 911 if in danger", async () => {
    await handOff("emergency");
    expect(sendFunnelMessage.mock.calls[0][1].body).toContain("911");
    expect(ownerSms.mock.calls[0][0].body).toMatch(/^URGENT/);
  });
});
