import { beforeEach, describe, expect, it, vi } from "vitest";

let fakeClient: { id: string; ai_text_assistant_enabled: boolean } | null;
let contactUpdates: { patch: unknown; filters: [string, string][] }[];
let sentEvents: unknown[];
let activitiesInserted: unknown[];
const sendInboxMessageForClient = vi.fn();

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/adapters", () => ({ getAiProvider: () => ({ suggestReply: async () => "x" }) }));
vi.mock("@/lib/inbox/send", () => ({ sendInboxMessageForClient }));
vi.mock("@/lib/inngest/client", () => ({
  inngest: {
    send: vi.fn((e: unknown) => {
      sentEvents.push(e);
      return Promise.resolve(undefined);
    }),
  },
}));

const fakeSupabase = {
  from(table: string) {
    if (table === "activities") {
      return {
        insert: async (row: unknown) => {
          activitiesInserted.push(row);
          return { error: null };
        },
      };
    }
    if (table !== "contacts") throw new Error(`unexpected table ${table}`);
    return {
      update(patch: unknown) {
        const record = { patch, filters: [] as [string, string][] };
        contactUpdates.push(record);
        const chain = {
          eq(col: string, value: string) {
            record.filters.push([col, value]);
            return chain;
          },
          then(resolve: (v: { error: null }) => void) {
            resolve({ error: null });
          },
        };
        return chain;
      },
    };
  },
};

vi.mock("@/lib/auth/session", () => ({
  requireMembership: async () => ({ supabase: fakeSupabase, client: fakeClient, role: "owner" }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  fakeClient = { id: "client1", ai_text_assistant_enabled: true };
  contactUpdates = [];
  activitiesInserted = [];
  sentEvents = [];
  sendInboxMessageForClient.mockResolvedValue({ ok: true });
});

describe("sendInboxMessage", () => {
  it("pauses the AI on the thread when the owner sends a text themselves", async () => {
    const { sendInboxMessage } = await import("@/app/(app)/inbox/actions");
    const result = await sendInboxMessage({ contactId: "contact1", channel: "sms", body: "Hi, it's Dave." });
    expect(result).toEqual({ ok: true });
    expect(contactUpdates).toHaveLength(1);
    expect(contactUpdates[0]!.patch).toMatchObject({ ai_paused_reason: "owner_replied" });
    expect(contactUpdates[0]!.filters).toEqual([
      ["id", "contact1"],
      ["client_id", "client1"],
    ]);
    expect(sentEvents).toContainEqual({
      name: "portal/ai-text.paused",
      data: { clientId: "client1", contactId: "contact1" },
    });
  });

  it("doesn't pause for an internal note", async () => {
    const { sendInboxMessage } = await import("@/app/(app)/inbox/actions");
    await sendInboxMessage({ contactId: "contact1", channel: "note", body: "Called, no answer." });
    expect(contactUpdates).toHaveLength(0);
  });

  it("doesn't pause when the assistant is off for this client", async () => {
    fakeClient = { id: "client1", ai_text_assistant_enabled: false };
    const { sendInboxMessage } = await import("@/app/(app)/inbox/actions");
    await sendInboxMessage({ contactId: "contact1", channel: "sms", body: "Hi" });
    expect(contactUpdates).toHaveLength(0);
  });

  it("doesn't pause when the text failed to send", async () => {
    sendInboxMessageForClient.mockResolvedValue({ error: "SMS not available" });
    const { sendInboxMessage } = await import("@/app/(app)/inbox/actions");
    const result = await sendInboxMessage({ contactId: "contact1", channel: "sms", body: "Hi" });
    expect(result).toEqual({ error: "SMS not available" });
    expect(contactUpdates).toHaveLength(0);
  });
});

describe("takeOverThread / handBackToAi", () => {
  it("take over pauses the AI and cancels any waiting reply", async () => {
    const { takeOverThread } = await import("@/app/(app)/inbox/actions");
    expect(await takeOverThread("contact1")).toEqual({ ok: true });
    expect(contactUpdates[0]!.patch).toMatchObject({ ai_paused_reason: "owner_takeover" });
    expect(sentEvents).toContainEqual(expect.objectContaining({ name: "portal/ai-text.paused" }));
  });

  it("hand back clears the pause", async () => {
    const { handBackToAi } = await import("@/app/(app)/inbox/actions");
    expect(await handBackToAi("contact1")).toEqual({ ok: true });
    expect(contactUpdates[0]!.patch).toEqual({ ai_paused_at: null, ai_paused_reason: null });
    // Recorded so the AI's eight-reply cap starts fresh from the hand-back.
    expect(activitiesInserted).toEqual([
      { client_id: "client1", contact_id: "contact1", type: "ai_thread_handed_back", payload: {} },
    ]);
    expect(contactUpdates[0]!.filters).toEqual([
      ["id", "contact1"],
      ["client_id", "client1"],
    ]);
  });
});
