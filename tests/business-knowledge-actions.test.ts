import { beforeEach, describe, expect, it, vi } from "vitest";

let fakeSupabase: unknown;
let fakeClient: { id: string };
let fakeRole: string;
let fakeFaqCount: number;

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({
  requireMembership: async () => ({ supabase: fakeSupabase, client: fakeClient, role: fakeRole }),
}));

function makeClientsTable(onUpdate: (patch: unknown) => void) {
  const chain = {
    update(patch: unknown) {
      onUpdate(patch);
      return chain;
    },
    eq: () => chain,
    then(resolve: (v: { error: null }) => void) {
      resolve({ error: null });
    },
  };
  return chain;
}

function makeFaqsTable(opts: {
  onInsert?: (row: unknown) => void;
  onUpdate?: (patch: unknown) => void;
  onDelete?: () => void;
}) {
  const chain = {
    select() {
      return chain;
    },
    eq() {
      return chain;
    },
    then(resolve: (v: { count: number }) => void) {
      resolve({ count: fakeFaqCount });
    },
    insert(row: unknown) {
      opts.onInsert?.(row);
      return Promise.resolve({ error: null });
    },
    update(patch: unknown) {
      opts.onUpdate?.(patch);
      return chain;
    },
    delete() {
      opts.onDelete?.();
      return chain;
    },
  };
  return chain;
}

function fd(fields: Record<string, string>) {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.set(k, v);
  return form;
}

beforeEach(() => {
  vi.clearAllMocks();
  fakeClient = { id: "client1" };
  fakeRole = "owner";
  fakeFaqCount = 0;
});

describe("updateBusinessKnowledge", () => {
  it("blocks office from editing", async () => {
    fakeRole = "office";
    const updates: unknown[] = [];
    fakeSupabase = { from: () => makeClientsTable((p) => updates.push(p)) };
    const { updateBusinessKnowledge } = await import(
      "@/app/(app)/settings/business-knowledge-actions"
    );
    const result = await updateBusinessKnowledge(fd({ services_offered: "x" }));
    expect(result).toEqual({ error: expect.stringContaining("owner or a Sitewyre admin") });
    expect(updates).toHaveLength(0);
  });

  it("lets an owner save all three fields", async () => {
    const updates: unknown[] = [];
    fakeSupabase = { from: () => makeClientsTable((p) => updates.push(p)) };
    const { updateBusinessKnowledge } = await import(
      "@/app/(app)/settings/business-knowledge-actions"
    );
    const result = await updateBusinessKnowledge(
      fd({
        services_offered: "Roof repair",
        after_hours_rules: "Call back in the morning",
        ai_never_say: "Never quote a price",
      }),
    );
    expect(result).toEqual({ ok: true });
    expect(updates).toContainEqual({
      services_offered: "Roof repair",
      after_hours_rules: "Call back in the morning",
      ai_never_say: "Never quote a price",
    });
  });

  it("clears a field when left blank", async () => {
    const updates: unknown[] = [];
    fakeSupabase = { from: () => makeClientsTable((p) => updates.push(p)) };
    const { updateBusinessKnowledge } = await import(
      "@/app/(app)/settings/business-knowledge-actions"
    );
    await updateBusinessKnowledge(fd({}));
    expect(updates).toContainEqual({
      services_offered: null,
      after_hours_rules: null,
      ai_never_say: null,
    });
  });
});

describe("addFaq", () => {
  it("blocks office from adding", async () => {
    fakeRole = "office";
    const inserted: unknown[] = [];
    fakeSupabase = { from: () => makeFaqsTable({ onInsert: (r) => inserted.push(r) }) };
    const { addFaq } = await import("@/app/(app)/settings/business-knowledge-actions");
    const result = await addFaq(fd({ question: "Q?", answer: "A." }));
    expect(result).toEqual({ error: expect.stringContaining("owner or a Sitewyre admin") });
    expect(inserted).toHaveLength(0);
  });

  it("rejects a missing question or answer", async () => {
    fakeSupabase = { from: () => makeFaqsTable({}) };
    const { addFaq } = await import("@/app/(app)/settings/business-knowledge-actions");
    const result = await addFaq(fd({ question: "Q?", answer: "" }));
    expect(result).toEqual({ error: expect.stringContaining("question and an answer") });
  });

  it("inserts with the next position", async () => {
    fakeFaqCount = 2;
    const inserted: unknown[] = [];
    fakeSupabase = { from: () => makeFaqsTable({ onInsert: (r) => inserted.push(r) }) };
    const { addFaq } = await import("@/app/(app)/settings/business-knowledge-actions");
    const result = await addFaq(fd({ question: "Do you offer warranties?", answer: "Yes, 1 year." }));
    expect(result).toEqual({ ok: true });
    expect(inserted).toContainEqual({
      client_id: "client1",
      question: "Do you offer warranties?",
      answer: "Yes, 1 year.",
      position: 2,
    });
  });
});

describe("updateFaq / deleteFaq", () => {
  it("updates an existing faq", async () => {
    const updates: unknown[] = [];
    fakeSupabase = { from: () => makeFaqsTable({ onUpdate: (p) => updates.push(p) }) };
    const { updateFaq } = await import("@/app/(app)/settings/business-knowledge-actions");
    const result = await updateFaq(fd({ faqId: "faq1", question: "Q2?", answer: "A2." }));
    expect(result).toEqual({ ok: true });
    expect(updates).toContainEqual({ question: "Q2?", answer: "A2." });
  });

  it("deletes a faq", async () => {
    let deleted = false;
    fakeSupabase = { from: () => makeFaqsTable({ onDelete: () => (deleted = true) }) };
    const { deleteFaq } = await import("@/app/(app)/settings/business-knowledge-actions");
    const result = await deleteFaq(fd({ faqId: "faq1" }));
    expect(result).toEqual({ ok: true });
    expect(deleted).toBe(true);
  });

  it("blocks crew from deleting", async () => {
    fakeRole = "crew";
    let deleted = false;
    fakeSupabase = { from: () => makeFaqsTable({ onDelete: () => (deleted = true) }) };
    const { deleteFaq } = await import("@/app/(app)/settings/business-knowledge-actions");
    const result = await deleteFaq(fd({ faqId: "faq1" }));
    expect(result).toEqual({ error: expect.stringContaining("owner or a Sitewyre admin") });
    expect(deleted).toBe(false);
  });
});
