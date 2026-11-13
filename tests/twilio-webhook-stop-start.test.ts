import { beforeEach, describe, expect, it, vi } from "vitest";

let fakeSupabase: unknown;
let state: {
  smsOptInUpdates: unknown[];
  optOutUpserts: unknown[];
  optOutDeleteCount: number;
};

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => fakeSupabase,
}));
vi.mock("@/lib/crm/contacts", () => ({
  findOrCreateContact: async () => ({ id: "contact1", name: "+15551234567" }),
}));
vi.mock("@/lib/inngest/client", () => ({
  inngest: { send: vi.fn().mockResolvedValue(undefined) },
}));
vi.mock("@/lib/push/web-push", () => ({
  sendPushToClient: vi.fn().mockResolvedValue(undefined),
}));

type TableOpts = {
  singleResponse?: { data: unknown };
  onInsert?: (row: unknown) => void;
  onUpdate?: (patch: unknown) => void;
  onUpsert?: (row: unknown) => void;
  onDelete?: () => void;
};

function makeTable(opts: TableOpts = {}) {
  const chain = {
    select() {
      return chain;
    },
    eq() {
      return chain;
    },
    neq() {
      return chain;
    },
    in() {
      return chain;
    },
    gte() {
      return chain;
    },
    order() {
      return chain;
    },
    limit() {
      return chain;
    },
    update(patch: unknown) {
      opts.onUpdate?.(patch);
      return chain;
    },
    upsert(row: unknown) {
      opts.onUpsert?.(row);
      return Promise.resolve({ error: null });
    },
    delete() {
      opts.onDelete?.();
      return chain;
    },
    insert(row: unknown) {
      opts.onInsert?.(row);
      return Promise.resolve({ data: null, error: null });
    },
    maybeSingle: async () => opts.singleResponse ?? { data: null },
    then(resolve: (v: { error: null }) => void) {
      resolve({ error: null });
    },
  };
  return chain;
}

function makeRequest(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return new Request("http://localhost:3000/api/twilio/webhook", {
    method: "POST",
    body: fd,
  });
}

const CLIENT_NUMBER = "+15555550100";
const CUSTOMER_NUMBER = "+15551234567";

beforeEach(() => {
  state = { smsOptInUpdates: [], optOutUpserts: [], optOutDeleteCount: 0 };
  fakeSupabase = {
    from(table: string) {
      if (table === "clients") {
        return makeTable({
          singleResponse: {
            data: {
              id: "client1",
              business_name: "Test Co",
              twilio_phone_number: CLIENT_NUMBER,
            },
          },
        });
      }
      if (table === "contacts") {
        return makeTable({
          onUpdate: (patch) => state.smsOptInUpdates.push(patch),
        });
      }
      if (table === "opt_outs") {
        return makeTable({
          onUpsert: (row) => state.optOutUpserts.push(row),
          onDelete: () => {
            state.optOutDeleteCount += 1;
          },
        });
      }
      return makeTable();
    },
  };
});

describe("Twilio webhook — STOP/START", () => {
  it("STOP opts the contact out and writes an opt_outs row", async () => {
    const { POST } = await import("@/app/api/twilio/webhook/route");
    await POST(
      makeRequest({
        To: CLIENT_NUMBER,
        From: CUSTOMER_NUMBER,
        Body: "stop",
        MessageSid: "SM1",
      }),
    );

    expect(state.smsOptInUpdates).toEqual([{ sms_opt_in: false }]);
    expect(state.optOutUpserts).toEqual([
      { client_id: "client1", phone: CUSTOMER_NUMBER },
    ]);
  });

  it("START reverses the opt-out", async () => {
    const { POST } = await import("@/app/api/twilio/webhook/route");
    await POST(
      makeRequest({
        To: CLIENT_NUMBER,
        From: CUSTOMER_NUMBER,
        Body: "  start  ",
        MessageSid: "SM2",
      }),
    );

    expect(state.smsOptInUpdates).toEqual([{ sms_opt_in: true }]);
    expect(state.optOutDeleteCount).toBe(1);
  });

  it("'Stop by Thursday' is NOT treated as an opt-out", async () => {
    const { POST } = await import("@/app/api/twilio/webhook/route");
    await POST(
      makeRequest({
        To: CLIENT_NUMBER,
        From: CUSTOMER_NUMBER,
        Body: "Stop by Thursday",
        MessageSid: "SM3",
      }),
    );

    expect(state.smsOptInUpdates).toHaveLength(0);
    expect(state.optOutUpserts).toHaveLength(0);
    expect(state.optOutDeleteCount).toBe(0);
  });
});
