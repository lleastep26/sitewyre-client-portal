import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sign } from "retell-sdk";

let fakeSupabase: unknown;
let clientRow: Record<string, unknown> | null;
let insertedLead: Record<string, unknown> | null;
let updatedLead: Record<string, unknown> | null;
let existingOpenLead: { id: string; name: string; contact_id: string | null } | null;

const findOrCreateContact = vi.fn();
const findOpenLeadForPhone = vi.fn();
const inngestSend = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => fakeSupabase }));
vi.mock("@/lib/crm/contacts", () => ({ findOrCreateContact }));
vi.mock("@/lib/leads/lifecycle", () => ({ findOpenLeadForPhone }));
vi.mock("@/lib/inngest/client", () => ({ inngest: { send: inngestSend } }));

function buildSupabase() {
  return {
    from(table: string) {
      if (table === "clients") {
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: clientRow }) }) }) };
      }
      if (table === "pipeline_stages") {
        return { select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: "stage1" } }) }) }) }) };
      }
      if (table === "leads") {
        return {
          insert: (row: Record<string, unknown>) => ({
            select: () => ({
              single: async () => {
                insertedLead = row;
                return { data: { id: "lead1" }, error: null };
              },
            }),
          }),
          update: (patch: Record<string, unknown>) => ({
            eq: async () => {
              updatedLead = patch;
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

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("RETELL_API_KEY", "test-key");
  fakeSupabase = buildSupabase();
  insertedLead = null;
  updatedLead = null;
  existingOpenLead = null;
  clientRow = { id: "client1", user_id: "user1" };
  findOrCreateContact.mockResolvedValue({ id: "contact1" });
  findOpenLeadForPhone.mockImplementation(async () => existingOpenLead);
  inngestSend.mockResolvedValue(undefined);
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("POST /api/retell/functions/upsert-lead", () => {
  it("requires a caller name", async () => {
    const res = await callRoute({
      name: "create_or_update_lead",
      args: { caller_phone: "+15551234567" },
      call: { call_id: "c1", agent_id: "a1", metadata: { client_id: "client1" } },
    });
    const json = await res.json();
    expect(json.error).toContain("caller's name");
    expect(insertedLead).toBeNull();
  });

  it("creates a new lead when there's no existing open one for this phone", async () => {
    const res = await callRoute({
      name: "create_or_update_lead",
      args: { caller_name: "Jane Doe", caller_phone: "+15551234567", reason: "Leaky faucet" },
      call: { call_id: "c1", agent_id: "a1", metadata: { client_id: "client1" } },
    });
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(insertedLead).toMatchObject({
      name: "Jane Doe",
      message: "Leaky faucet",
      source: "ai_receptionist",
    });
    expect(inngestSend).toHaveBeenCalledWith(
      expect.objectContaining({ name: "portal/lead.created" }),
    );
  });

  it("updates the existing open lead for this phone instead of duplicating", async () => {
    existingOpenLead = { id: "lead_existing", name: "Jane Doe", contact_id: "contact1" };
    const res = await callRoute({
      name: "create_or_update_lead",
      args: { caller_name: "Jane Doe", caller_phone: "+15551234567", reason: "Now says it's urgent" },
      call: { call_id: "c1", agent_id: "a1", metadata: { client_id: "client1" } },
    });
    const json = await res.json();
    expect(json).toEqual({ ok: true, lead_id: "lead_existing" });
    expect(updatedLead).toMatchObject({ message: "Now says it's urgent" });
    expect(insertedLead).toBeNull();
  });
});
