import { beforeEach, describe, expect, it, vi } from "vitest";

const ownerSms = vi.fn();
const findOrCreateContact = vi.fn();

vi.mock("@/lib/adapters", () => ({ getSmsProvider: () => ({ send: ownerSms }) }));
vi.mock("@/lib/a2p/sending", () => ({ resolveSmsFrom: () => "+15555550100" }));
vi.mock("@/lib/crm/contacts", () => ({ findOrCreateContact }));

type Row = Record<string, unknown>;
let alreadyRecorded: boolean;
let leads: Row[];
let appointment: Row | null;
let inserted: Record<string, Row[]>;
let updated: Record<string, Row[]>;

function chainFor(table: string) {
  const chain: Record<string, unknown> = {
    select: () => chain,
    eq: () => chain,
    neq: () => chain,
    gte: () => chain,
    contains: () => chain,
    order: () => chain,
    limit: () => {
      if (table === "workflow_runs") return Promise.resolve({ data: alreadyRecorded ? [{ id: "wr1" }] : [] });
      if (table === "leads") return Promise.resolve({ data: leads });
      return chain;
    },
    maybeSingle: async () => {
      if (table === "clients") {
        return {
          data: { id: "client1", phone: "+15129998888", timezone: "America/Chicago", user_id: "user1" },
        };
      }
      if (table === "appointments") return { data: appointment };
      if (table === "pipeline_stages") return { data: { id: "stage1" } };
      return { data: null };
    },
    single: async () => ({ data: { id: "lead_new", name: "Unknown caller", contact_id: "contact_new" } }),
    insert: (row: Row) => {
      (inserted[table] ??= []).push(row);
      return chain;
    },
    update: (patch: Row) => {
      (updated[table] ??= []).push(patch);
      return chain;
    },
    then: (resolve: (v: { error: null }) => void) => resolve({ error: null }),
  };
  return chain;
}

const supabase = { from: (table: string) => chainFor(table) };

const base = {
  clientId: "client1",
  callId: "call_1",
  callerNumber: "+15551234567",
  twilioCallSid: "CAcaller",
  summary: "Caller has a leaking water heater.",
  recordingUrl: "https://retell.example/rec.wav",
  startTimestamp: Date.parse("2026-11-13T15:00:00.000Z"),
};

async function record(overrides: Partial<typeof base> = {}) {
  const { recordAiCallOutcome } = await import("@/lib/retell/call-summary");
  return recordAiCallOutcome(supabase as never, { ...base, ...overrides });
}

beforeEach(() => {
  vi.clearAllMocks();
  alreadyRecorded = false;
  leads = [{ id: "lead1", name: "Jane Doe", phone: "+15551234567", contact_id: "contact1" }];
  appointment = null;
  inserted = {};
  updated = {};
  ownerSms.mockResolvedValue({ id: "SM1", status: "sent" });
  findOrCreateContact.mockResolvedValue({ id: "contact_new" });
});

describe("recordAiCallOutcome", () => {
  it("saves the summary and recording on the lead and sends the owner one text", async () => {
    const result = await record();
    expect(result).toEqual({ recorded: true });

    expect(inserted.workflow_runs).toEqual([
      expect.objectContaining({
        trigger: "ai_receptionist_call",
        log: expect.objectContaining({
          leadId: "lead1",
          callId: "call_1",
          summary: "Caller has a leaking water heater.",
          recordingUrl: "https://retell.example/rec.wav",
          booked: null,
        }),
      }),
    ]);
    expect(inserted.messages?.[0]).toMatchObject({ channel: "call", contact_id: "contact1" });
    expect(updated.calls?.[0]).toMatchObject({ recording_url: "https://retell.example/rec.wav" });

    expect(ownerSms).toHaveBeenCalledTimes(1);
    const body = ownerSms.mock.calls[0][0].body as string;
    expect(body).toContain("Jane Doe");
    expect(body).toContain("+15551234567");
    expect(body).toContain("leaking water heater");
    expect(body).toContain("No booking made.");
  });

  it("includes a booking made during the call", async () => {
    appointment = { title: "Service call", start_at: "2026-11-16T20:00:00.000Z" };
    await record();
    const body = ownerSms.mock.calls[0][0].body as string;
    expect(body).toContain("Booked: Service call, Mon, Nov 16, 2:00 PM.");
    expect(body).not.toContain("No booking made");
  });

  it("does nothing the second time for the same call", async () => {
    alreadyRecorded = true;
    const result = await record();
    expect(result).toEqual({ recorded: false });
    expect(ownerSms).not.toHaveBeenCalled();
    expect(inserted.workflow_runs).toBeUndefined();
  });

  it("creates the lead when the agent never did", async () => {
    leads = [];
    await record();
    expect(inserted.leads?.[0]).toMatchObject({
      name: "Unknown caller",
      phone: "+15551234567",
      source: "ai_receptionist",
      message: "Caller has a leaking water heater.",
    });
    expect((ownerSms.mock.calls[0][0].body as string)).toContain("Unknown caller");
  });

  it("still texts the owner when no summary ever arrived", async () => {
    await record({ summary: null as never });
    expect((ownerSms.mock.calls[0][0].body as string)).toContain("No summary was available");
  });
});
