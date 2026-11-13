import { beforeEach, describe, expect, it, vi } from "vitest";

const findOrCreateContact = vi.fn();
vi.mock("@/lib/crm/contacts", () => ({ findOrCreateContact }));
vi.mock("@/lib/inngest/client", () => ({ inngest: { send: vi.fn().mockResolvedValue(undefined) } }));

let stopOnFile: boolean;
let contactUpdates: unknown[];
let leadInserted: Record<string, unknown> | null;

const supabase = {
  from(table: string) {
    const chain: Record<string, unknown> = {
      select: () => chain,
      eq: () => chain,
      maybeSingle: async () => {
        if (table === "opt_outs") return { data: stopOnFile ? { phone: "+14055550142" } : null };
        if (table === "pipeline_stages") return { data: { id: "stage_new" } };
        return { data: null };
      },
      single: async () => ({ data: { id: "lead1", ...leadInserted }, error: null }),
      insert: (row: Record<string, unknown>) => {
        if (table === "leads") leadInserted = row;
        return chain;
      },
      update: (patch: unknown) => {
        if (table === "contacts") contactUpdates.push(patch);
        return chain;
      },
      then: (resolve: (v: { error: null }) => void) => resolve({ error: null }),
    };
    return chain;
  },
};

async function ingest(overrides: Record<string, unknown> = {}) {
  const { ingestLead } = await import("@/lib/leads/ingest");
  return ingestLead(supabase as never, { id: "client1" }, {
    name: "Jo",
    phone: "(405) 555-0142",
    message: "Need a quote",
    source: "website_form",
    ...overrides,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  stopOnFile = false;
  contactUpdates = [];
  leadInserted = null;
  findOrCreateContact.mockResolvedValue({ id: "contact1", sms_opt_in: false });
});

describe("ingestLead: SMS consent", () => {
  it("gives consent to a contact who had none when the new form showed the consent wording", async () => {
    await ingest({ smsOptIn: true, consentShown: true });
    expect(contactUpdates).toEqual([{ sms_opt_in: true }]);
  });

  it("never overrides a STOP", async () => {
    stopOnFile = true;
    await ingest({ smsOptIn: true, consentShown: true });
    expect(contactUpdates).toEqual([]);
  });

  it("leaves consent alone when the form didn't show the wording", async () => {
    await ingest({ smsOptIn: false, consentShown: false });
    await ingest({});
    expect(contactUpdates).toEqual([]);
  });

  it("creates a new contact without consent for a captured lead, and stores an email-only lead with no phone", async () => {
    findOrCreateContact.mockResolvedValue({ id: "contact2", sms_opt_in: false });
    await ingest({ phone: "", email: "jo@example.com", smsOptIn: false, consentShown: false });
    expect(findOrCreateContact).toHaveBeenLastCalledWith(
      supabase,
      expect.objectContaining({ smsOptIn: false, phone: "", email: "jo@example.com" }),
    );
    expect(leadInserted).toMatchObject({ phone: "", email: "jo@example.com" });
  });
});
