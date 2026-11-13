import { beforeEach, describe, expect, it, vi } from "vitest";

const sendSpy = vi.fn();
const inngestSendSpy = vi.fn().mockResolvedValue(undefined);

// Mutated per test before calling updateJobStatus; the mocks below read
// these by closure at call time, not at module-eval time.
let fakeSupabase: unknown;
let fakeClient: unknown;

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/adapters", () => ({ getSmsProvider: () => ({ send: sendSpy }) }));
vi.mock("@/lib/inngest/client", () => ({ inngest: { send: inngestSendSpy } }));
vi.mock("@/lib/auth/session", () => ({
  requireMembership: async () => ({ supabase: fakeSupabase, client: fakeClient }),
}));
// Force the "immediate" send branch regardless of real wall-clock time, so
// this test isn't flaky depending on when it happens to run.
vi.mock("@/lib/scheduling/quiet-hours", () => ({
  nextSendableAt: () => new Date(),
}));

type TableResponse = { data: unknown };

function makeTable(
  response: TableResponse = { data: null },
  onInsert?: (row: unknown) => void,
) {
  const chain = {
    select() {
      return chain;
    },
    eq() {
      return chain;
    },
    contains() {
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
      return Promise.resolve({ data: null, error: null });
    },
    maybeSingle: async () => response,
    then(resolve: (v: { error: null }) => void) {
      resolve({ error: null });
    },
  };
  return chain;
}

beforeEach(() => {
  sendSpy.mockClear();
  inngestSendSpy.mockClear();
  fakeClient = {
    id: "client1",
    business_name: "Test Co",
    twilio_phone_number: "+15555550100",
    timezone: "America/Chicago",
    a2p_status: "approved",
    phone: "+15550001111",
  };
});

describe("updateJobStatus — on_my_way opt-out gate", () => {
  it("skips the immediate SMS and logs it skipped/opted_out, the exact gap this closes", async () => {
    const workflowRuns: unknown[] = [];
    fakeSupabase = {
      from(table: string) {
        if (table === "opt_outs") {
          return makeTable({ data: { phone: "+15551234567" } });
        }
        if (table === "workflow_runs") {
          return makeTable({ data: null }, (row) => workflowRuns.push(row));
        }
        return makeTable();
      },
    };

    const { updateJobStatus } = await import("@/app/(app)/jobs/actions");
    await updateJobStatus({
      jobId: "job1",
      status: "en_route",
      contactPhone: "+15551234567",
    });

    expect(sendSpy).not.toHaveBeenCalled();
    // portal/job.status_changed is sent unconditionally on every status
    // update (for reviewRequestDrip's cancelOn) — only the on_my_way
    // reminder dispatch itself must not happen.
    expect(
      inngestSendSpy.mock.calls.every(
        ([arg]) => (arg as { name: string }).name === "portal/job.status_changed",
      ),
    ).toBe(true);
    expect(workflowRuns).toHaveLength(1);
    expect(workflowRuns[0]).toMatchObject({
      trigger: "on_my_way",
      status: "skipped",
      log: expect.objectContaining({ reason: "opted_out" }),
    });
  });

  it("still sends immediately when the phone is not opted out", async () => {
    const workflowRuns: unknown[] = [];
    fakeSupabase = {
      from(table: string) {
        if (table === "opt_outs") return makeTable({ data: null });
        if (table === "workflow_runs") {
          return makeTable({ data: null }, (row) => workflowRuns.push(row));
        }
        return makeTable();
      },
    };

    const { updateJobStatus } = await import("@/app/(app)/jobs/actions");
    await updateJobStatus({
      jobId: "job1",
      status: "en_route",
      contactPhone: "+15559876543",
    });

    expect(sendSpy).toHaveBeenCalledTimes(1);
    expect(workflowRuns[0]).toMatchObject({
      trigger: "on_my_way",
      status: "sent",
    });
  });

  it("blocks the immediate SMS when A2P isn't approved, and logs why", async () => {
    fakeClient = { ...(fakeClient as object), a2p_status: "pending" };
    const workflowRuns: unknown[] = [];
    fakeSupabase = {
      from(table: string) {
        if (table === "opt_outs") return makeTable({ data: null });
        if (table === "workflow_runs") {
          return makeTable({ data: null }, (row) => workflowRuns.push(row));
        }
        return makeTable();
      },
    };

    const { updateJobStatus } = await import("@/app/(app)/jobs/actions");
    await updateJobStatus({
      jobId: "job1",
      status: "en_route",
      contactPhone: "+15559876543",
    });

    expect(sendSpy).not.toHaveBeenCalled();
    expect(workflowRuns[0]).toMatchObject({
      trigger: "on_my_way",
      status: "skipped",
      log: expect.objectContaining({ reason: "a2p_pending" }),
    });
  });
});
