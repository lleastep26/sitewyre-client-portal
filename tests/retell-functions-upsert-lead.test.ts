import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sign } from "retell-sdk";

let fakeSupabase: unknown;
let clientRow: Record<string, unknown> | null;
let contactPatch: Record<string, unknown> | null;

const findOrCreateContact = vi.fn();
const findContactByPhone = vi.fn();
const findLeadForCall = vi.fn();
const touchCallLead = vi.fn();
const createCallLead = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => fakeSupabase }));
vi.mock("@/lib/crm/contacts", () => ({ findOrCreateContact, findContactByPhone }));
vi.mock("@/lib/retell/call-lead", () => ({
  findLeadForCall,
  touchCallLead,
  createCallLead,
  isFromThisCall: (createdAt: string, _now: Date, start: Date | null) =>
    !!start && Date.parse(createdAt) >= start.getTime(),
}));

function buildSupabase() {
  return {
    from(table: string) {
      if (table === "clients") {
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: clientRow }) }) }) };
      }
      if (table === "contacts") {
        return {
          update: (patch: Record<string, unknown>) => ({
            eq: async () => {
              contactPatch = patch;
              return { error: null };
            },
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
}

async function callRoute(body: unknown) {
  const raw = JSON.stringify(body);
  const signature = await sign(raw, "test-key");
  const { POST } = await import("@/app/api/retell/functions/upsert-lead/route");
  return POST(
    new Request("http://localhost/api/retell/functions/upsert-lead", {
      method: "POST",
      headers: { "x-retell-signature": signature },
      body: raw,
    }),
  );
}

const CALL_START = Date.parse("2026-11-13T21:41:00.000Z");
const call = (metadata: Record<string, unknown> = { client_id: "client1", caller_number: "+15551234567" }) => ({
  call_id: "c1",
  agent_id: "a1",
  start_timestamp: CALL_START,
  metadata,
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("RETELL_API_KEY", "test-key");
  fakeSupabase = buildSupabase();
  contactPatch = null;
  clientRow = { id: "client1", user_id: "user1" };
  findOrCreateContact.mockResolvedValue({
    id: "contact1",
    name: "Jane Doe",
    phones: ["+15551234567"],
    source: "website",
    created_at: "2026-10-01T00:00:00.000Z",
  });
  findContactByPhone.mockResolvedValue(null);
  findLeadForCall.mockResolvedValue(null);
  createCallLead.mockResolvedValue({ lead: { id: "lead1", name: "Jane Doe", contact_id: "contact1" }, error: null });
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("POST /api/retell/functions/upsert-lead", () => {
  it("requires a caller name", async () => {
    const res = await callRoute({
      name: "create_or_update_lead",
      args: { caller_phone: "+15551234567" },
      call: call(),
    });
    const json = await res.json();
    expect(json.error).toContain("caller's name");
    expect(createCallLead).not.toHaveBeenCalled();
  });

  it("creates a new lead when the caller has no live lead", async () => {
    const res = await callRoute({
      name: "create_or_update_lead",
      args: { caller_name: "Jane Doe", reason: "Leaky faucet" },
      call: call(),
    });
    const json = await res.json();
    expect(json).toEqual({ ok: true, lead_id: "lead1" });
    expect(findLeadForCall).toHaveBeenCalledWith(
      fakeSupabase,
      "client1",
      "+15551234567",
      expect.objectContaining({ callStartedAt: new Date(CALL_START), contactId: "contact1" }),
    );
    expect(createCallLead).toHaveBeenCalledWith(
      fakeSupabase,
      expect.objectContaining({
        contactId: "contact1",
        name: "Jane Doe",
        phone: "+15551234567",
        message: "Leaky faucet",
      }),
    );
    expect(contactPatch).toBeNull();
  });

  it("updates the caller's live lead instead of duplicating", async () => {
    const existing = { id: "lead_existing", name: "Jane Doe", contact_id: "contact1" };
    findLeadForCall.mockResolvedValue(existing);
    const res = await callRoute({
      name: "create_or_update_lead",
      args: { caller_name: "Jane Doe", reason: "Now says it's urgent" },
      call: call(),
    });
    const json = await res.json();
    expect(json).toEqual({ ok: true, lead_id: "lead_existing" });
    expect(touchCallLead).toHaveBeenCalledWith(
      fakeSupabase,
      "client1",
      existing,
      expect.objectContaining({ name: "Jane Doe", message: "Now says it's urgent" }),
    );
    expect(createCallLead).not.toHaveBeenCalled();
  });

  it("renames a contact made on this call when the caller corrects their name", async () => {
    findOrCreateContact.mockResolvedValue({
      id: "contact1",
      name: "Play",
      phones: ["+15551234567"],
      source: "ai_receptionist",
      created_at: "2026-11-13T21:41:30.000Z",
    });
    await callRoute({
      name: "create_or_update_lead",
      args: { caller_name: "Clay", reason: "Standard clean" },
      call: call(),
    });
    expect(contactPatch).toEqual({ name: "Clay" });
  });

  it("never renames an existing customer's contact", async () => {
    await callRoute({
      name: "create_or_update_lead",
      args: { caller_name: "Jayne", reason: "Standard clean" },
      call: call(),
    });
    expect(contactPatch).toBeNull();
  });

  it("keeps the caller's own number as their identity and saves a different callback number", async () => {
    await callRoute({
      name: "create_or_update_lead",
      args: { caller_name: "Jane Doe", caller_phone: "555-000-1111", reason: "Call my cell" },
      call: call(),
    });
    expect(findOrCreateContact).toHaveBeenCalledWith(
      fakeSupabase,
      expect.objectContaining({ phone: "+15551234567" }),
    );
    expect(contactPatch).toEqual({ phones: ["+15551234567", "+15550001111"] });
    expect(createCallLead).toHaveBeenCalledWith(
      fakeSupabase,
      expect.objectContaining({ phone: "+15550001111", contactId: "contact1" }),
    );
  });

  it("reports a lead that couldn't be saved", async () => {
    createCallLead.mockResolvedValue({ lead: null, error: "insert failed" });
    const res = await callRoute({
      name: "create_or_update_lead",
      args: { caller_name: "Jane Doe" },
      call: call(),
    });
    expect(await res.json()).toEqual({ error: "insert failed" });
  });
});
