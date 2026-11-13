import { beforeEach, describe, expect, it, vi } from "vitest";

const inngestSend = vi.fn();
vi.mock("@/lib/inngest/client", () => ({ inngest: { send: inngestSend } }));

type Row = Record<string, unknown>;
let leads: Row[];
let stage: Row | null;
let inserted: Row[];
let updated: Row[];
let insertError: { message: string } | null;

const supabase = {
  from(table: string) {
    const chain: Record<string, unknown> = {
      select: () => chain,
      eq: () => chain,
      order: () => chain,
      limit: () => Promise.resolve({ data: leads }),
      maybeSingle: async () => ({ data: table === "pipeline_stages" ? stage : null }),
      insert: (row: Row) => {
        inserted.push(row);
        return chain;
      },
      single: async () =>
        insertError
          ? { data: null, error: insertError }
          : { data: { id: "lead_new", name: inserted[0]?.name, contact_id: inserted[0]?.contact_id }, error: null },
      update: (patch: Row) => {
        updated.push(patch);
        return chain;
      },
      then: (resolve: (v: { error: null }) => void) => resolve({ error: null }),
    };
    return chain;
  },
};

const NOW = new Date("2026-11-13T21:45:00.000Z");
const CALL_START = new Date("2026-11-13T21:41:00.000Z");
const PHONE = "+14055550199";

function lead(overrides: Row = {}): Row {
  return {
    id: "lead1",
    name: "Clay",
    phone: PHONE,
    contact_id: "contact1",
    stage_id: "stage1",
    source: "website_form",
    lifecycle_status: "new",
    created_at: "2026-11-10T15:00:00.000Z",
    last_activity_at: "2026-11-10T15:00:00.000Z",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  leads = [];
  stage = { id: "stage_new" };
  inserted = [];
  updated = [];
  insertError = null;
  inngestSend.mockResolvedValue(undefined);
});

describe("findLeadForCall", () => {
  it("reuses an open lead with recent activity", async () => {
    const { findLeadForCall } = await import("@/lib/retell/call-lead");
    leads = [lead()];
    const found = await findLeadForCall(supabase as never, "client1", "405-555-0199", {
      now: NOW,
      callStartedAt: CALL_START,
    });
    expect(found).toMatchObject({ id: "lead1", fromThisCall: false });
  });

  it("ignores an open lead that's had no activity for over 30 days", async () => {
    const { findLeadForCall } = await import("@/lib/retell/call-lead");
    // The real case: a two-month-old lead with the caller's number, saved
    // without the +1 and never touched since.
    leads = [
      lead({
        phone: "4055550199",
        created_at: "2026-09-15T21:32:27.000Z",
        last_activity_at: null,
        stage_id: null,
        source: null,
      }),
    ];
    const found = await findLeadForCall(supabase as never, "client1", PHONE, {
      now: NOW,
      callStartedAt: CALL_START,
    });
    expect(found).toBeNull();
  });

  it("ignores a recent lead that's already booked or lost", async () => {
    const { findLeadForCall } = await import("@/lib/retell/call-lead");
    leads = [lead({ lifecycle_status: "booked" })];
    expect(
      await findLeadForCall(supabase as never, "client1", PHONE, { now: NOW, callStartedAt: CALL_START }),
    ).toBeNull();
  });

  it("keeps the lead a booking on this call just moved to booked", async () => {
    const { findLeadForCall } = await import("@/lib/retell/call-lead");
    leads = [
      lead({
        lifecycle_status: "booked",
        created_at: "2026-11-13T21:42:00.000Z",
        last_activity_at: "2026-11-13T21:43:30.000Z",
      }),
    ];
    const found = await findLeadForCall(supabase as never, "client1", PHONE, {
      now: NOW,
      callStartedAt: CALL_START,
    });
    expect(found).toMatchObject({ id: "lead1", fromThisCall: true });
  });

  it("matches on the caller's contact when the lead carries a different callback number", async () => {
    const { findLeadForCall } = await import("@/lib/retell/call-lead");
    leads = [lead({ phone: "+14055550111", created_at: "2026-11-13T21:42:00.000Z" })];
    const found = await findLeadForCall(supabase as never, "client1", PHONE, {
      now: NOW,
      callStartedAt: CALL_START,
      contactId: "contact1",
    });
    expect(found?.id).toBe("lead1");
  });

  it("picks the newest matching lead", async () => {
    const { findLeadForCall } = await import("@/lib/retell/call-lead");
    leads = [lead({ id: "newer", created_at: "2026-11-12T10:00:00.000Z" }), lead({ id: "older" })];
    const found = await findLeadForCall(supabase as never, "client1", PHONE, { now: NOW });
    expect(found?.id).toBe("newer");
  });
});

describe("touchCallLead", () => {
  const existing = {
    id: "lead1",
    name: "Clay",
    phone: PHONE,
    contact_id: null,
    stage_id: null,
    source: null,
    fromThisCall: false,
  };

  it("fills in the stage, contact and source so the lead shows on the Leads page", async () => {
    const { touchCallLead } = await import("@/lib/retell/call-lead");
    await touchCallLead(supabase as never, "client1", existing, {
      contactId: "contact9",
      message: "Wants a deep clean",
    });
    expect(updated[0]).toMatchObject({
      stage_id: "stage_new",
      contact_id: "contact9",
      source: "ai_receptionist",
      message: "Wants a deep clean",
    });
    expect(updated[0]).not.toHaveProperty("name");
  });

  it("keeps an existing lead's own source, stage and name", async () => {
    const { touchCallLead } = await import("@/lib/retell/call-lead");
    await touchCallLead(
      supabase as never,
      "client1",
      { ...existing, contact_id: "contact1", stage_id: "stage2", source: "website_form" },
      { contactId: "contact1", name: "Play", phone: "+14055550111" },
    );
    expect(Object.keys(updated[0])).toEqual(["last_activity_at"]);
  });

  it("takes a corrected name and number on a lead made during this call", async () => {
    const { touchCallLead } = await import("@/lib/retell/call-lead");
    await touchCallLead(
      supabase as never,
      "client1",
      { ...existing, name: "Play", stage_id: "stage1", source: "ai_receptionist", fromThisCall: true },
      { contactId: "contact1", name: "Clay", phone: "+14055550111" },
    );
    expect(updated[0]).toMatchObject({ name: "Clay", phone: "+14055550111" });
  });
});

describe("createCallLead", () => {
  it("creates the lead in the New stage and starts the lead workflow without the New lead alert", async () => {
    const { createCallLead } = await import("@/lib/retell/call-lead");
    const { lead: created } = await createCallLead(supabase as never, {
      client: { id: "client1", user_id: "user1" },
      contactId: "contact1",
      name: "Clay",
      phone: PHONE,
      message: "Standard clean",
    });
    expect(created?.id).toBe("lead_new");
    expect(inserted[0]).toMatchObject({
      name: "Clay",
      phone: PHONE,
      source: "ai_receptionist",
      stage_id: "stage_new",
      contact_id: "contact1",
      owner_id: "user1",
    });
    expect(inngestSend).toHaveBeenCalledWith({
      name: "portal/lead.created",
      data: { clientId: "client1", leadId: "lead_new", phone: PHONE, name: "Clay", skipOwnerAlert: true },
    });
  });

  it("names the lead Unknown caller when there's no name", async () => {
    const { createCallLead } = await import("@/lib/retell/call-lead");
    await createCallLead(supabase as never, {
      client: { id: "client1", user_id: null },
      contactId: null,
      name: null,
      phone: PHONE,
      message: "No summary",
    });
    expect(inserted[0]).toMatchObject({ name: "Unknown caller" });
  });

  it("reports a failed insert and starts no workflow", async () => {
    const { createCallLead } = await import("@/lib/retell/call-lead");
    insertError = { message: "insert failed" };
    const result = await createCallLead(supabase as never, {
      client: { id: "client1", user_id: null },
      contactId: null,
      name: "Clay",
      phone: PHONE,
      message: "x",
    });
    expect(result).toEqual({ lead: null, error: "insert failed" });
    expect(inngestSend).not.toHaveBeenCalled();
  });
});
