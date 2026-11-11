import { beforeEach, describe, expect, it, vi } from "vitest";

const inngestSendSpy = vi.fn().mockResolvedValue(undefined);
const sendSpy = vi.fn();
let fakeSupabase: unknown;
let fakeClient: unknown;

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/adapters", () => ({ getSmsProvider: () => ({ send: sendSpy }) }));
vi.mock("@/lib/inngest/client", () => ({ inngest: { send: inngestSendSpy } }));
vi.mock("@/lib/auth/session", () => ({
  requireMembership: async () => ({ supabase: fakeSupabase, client: fakeClient }),
}));

type TableResponse = { data: unknown };

function makeTable(
  responses: TableResponse[] = [{ data: null }],
  onInsert?: (row: unknown) => void,
) {
  let i = 0;
  const next = () => responses[Math.min(i++, responses.length - 1)];
  const chain = {
    select() {
      return chain;
    },
    eq() {
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
    update() {
      return chain;
    },
    insert(row: unknown) {
      onInsert?.(row);
      return chain;
    },
    single: async () => next(),
    maybeSingle: async () => next(),
    then(resolve: (v: { error: null }) => void) {
      resolve({ error: null });
    },
  };
  return chain;
}

function buildSupabase(opts: {
  reviewLinksResponses: TableResponse[];
  onReviewLinksInsert?: (row: unknown) => void;
}) {
  // One shared chain for review_links: the 90-day check and the
  // insert-then-select both call .from("review_links"), and must share
  // the same response queue across those two calls, not each get a fresh
  // one starting back at index 0.
  const reviewLinksTable = makeTable(
    opts.reviewLinksResponses,
    opts.onReviewLinksInsert,
  );
  return {
    from(table: string) {
      if (table === "jobs") {
        return makeTable([{ data: { contact_id: "contact1" } }]);
      }
      if (table === "contacts") {
        return makeTable([{ data: { phones: ["+15551234567"] } }]);
      }
      if (table === "review_links") {
        return reviewLinksTable;
      }
      return makeTable();
    },
  };
}

function findSentEvent(name: string) {
  const call = inngestSendSpy.mock.calls.find(
    (callArgs) => (callArgs[0] as { name: string })?.name === name,
  );
  return call?.[0] as { data: Record<string, unknown> } | undefined;
}

beforeEach(() => {
  inngestSendSpy.mockClear();
  sendSpy.mockClear();
  fakeClient = {
    id: "client1",
    business_name: "Test Co",
    timezone: "America/Chicago",
    twilio_phone_number: "+15555550100",
    google_review_url: "https://g.page/r/test",
    google_place_id: null,
  };
});

describe("updateJobStatus — review-request dispatch", () => {
  it("creates a review_links row and dispatches portal/review_request.started when nothing blocks it", async () => {
    const insertSpy = vi.fn();
    fakeSupabase = buildSupabase({
      reviewLinksResponses: [{ data: null }, { data: { token: "tok123" } }],
      onReviewLinksInsert: insertSpy,
    });

    const { updateJobStatus } = await import("@/app/(app)/jobs/actions");
    await updateJobStatus({ jobId: "job1", status: "complete" });

    expect(insertSpy).toHaveBeenCalledWith({
      client_id: "client1",
      contact_id: "contact1",
      source: "review_request",
    });

    const event = findSentEvent("portal/review_request.started");
    if (!event) throw new Error("expected portal/review_request.started to be sent");
    expect(event.data).toMatchObject({
      jobId: "job1",
      clientId: "client1",
      contactId: "contact1",
      phone: "+15551234567",
      from: "+15555550100",
      reviewToken: "tok123",
    });
    expect(typeof event.data.completedAt).toBe("string");
  });

  it("skips and never creates a review_links row when one already exists within 90 days", async () => {
    const insertSpy = vi.fn();
    fakeSupabase = buildSupabase({
      reviewLinksResponses: [{ data: { created_at: new Date().toISOString() } }],
      onReviewLinksInsert: insertSpy,
    });

    const { updateJobStatus } = await import("@/app/(app)/jobs/actions");
    await updateJobStatus({ jobId: "job1", status: "complete" });

    expect(insertSpy).not.toHaveBeenCalled();
    expect(findSentEvent("portal/review_request.started")).toBeUndefined();
  });

  it("sends portal/job.status_changed for every status update, not just complete", async () => {
    fakeSupabase = buildSupabase({ reviewLinksResponses: [{ data: null }] });

    const { updateJobStatus } = await import("@/app/(app)/jobs/actions");
    await updateJobStatus({ jobId: "job1", status: "scheduled" });

    const event = findSentEvent("portal/job.status_changed");
    if (!event) throw new Error("expected portal/job.status_changed to be sent");
    expect(event.data).toEqual({ jobId: "job1", status: "scheduled" });
  });
});
