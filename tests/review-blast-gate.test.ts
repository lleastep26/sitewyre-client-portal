import { describe, expect, it } from "vitest";
import { shouldStopReviewBlast } from "@/lib/funnels/review-blast-gate";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

function fakeSupabase(responses: Record<string, { data: unknown }>) {
  return {
    from(table: string) {
      const result = responses[table] ?? { data: null };
      const chain = {
        select: () => chain,
        eq: () => chain,
        gt: () => chain,
        order: () => chain,
        limit: () => chain,
        maybeSingle: async () => result,
      };
      return chain;
    },
  } as unknown as SupabaseClient<Database>;
}

const BASE = {
  clientId: "client1",
  phone: "+15551234567",
  contactId: "contact1",
  since: new Date(Date.now() - 60_000).toISOString(),
  reviewToken: "tok123",
};

const APPROVED_CLIENT = { data: { a2p_status: "approved", phone: "+19995550000" } };

describe("shouldStopReviewBlast", () => {
  it("stops when the automation is disabled", async () => {
    const supabase = fakeSupabase({
      client_automations: { data: { enabled: false, template_body: null } },
      clients: APPROVED_CLIENT,
    });
    expect(
      await shouldStopReviewBlast(supabase, { ...BASE, checkClicked: false }),
    ).toEqual({ stop: true, reason: "disabled" });
  });

  it("stops when A2P isn't approved", async () => {
    const supabase = fakeSupabase({
      client_automations: { data: null },
      clients: { data: { a2p_status: "failed", phone: "+19995550000" } },
      opt_outs: { data: null },
      messages: { data: null },
      review_links: { data: { clicked_at: null } },
    });
    expect(
      await shouldStopReviewBlast(supabase, { ...BASE, checkClicked: false }),
    ).toEqual({ stop: true, reason: "a2p_failed" });
  });

  it("does not stop on A2P when the destination is the client's own phone", async () => {
    const supabase = fakeSupabase({
      client_automations: { data: null },
      clients: { data: { a2p_status: "pending", phone: BASE.phone } },
      opt_outs: { data: null },
      messages: { data: null },
      review_links: { data: { clicked_at: null } },
    });
    expect(
      await shouldStopReviewBlast(supabase, { ...BASE, checkClicked: false }),
    ).toEqual({ stop: false });
  });

  it("stops when opted out", async () => {
    const supabase = fakeSupabase({
      client_automations: { data: null },
      clients: APPROVED_CLIENT,
      opt_outs: { data: { phone: BASE.phone } },
    });
    expect(
      await shouldStopReviewBlast(supabase, { ...BASE, checkClicked: false }),
    ).toEqual({ stop: true, reason: "opted_out" });
  });

  it("stops when the contact replied since the import", async () => {
    const supabase = fakeSupabase({
      client_automations: { data: null },
      clients: APPROVED_CLIENT,
      opt_outs: { data: null },
      messages: { data: { id: "msg1" } },
    });
    expect(
      await shouldStopReviewBlast(supabase, { ...BASE, checkClicked: false }),
    ).toEqual({ stop: true, reason: "replied" });
  });

  it("does not check clicked_at before step 1 even if the link was already clicked", async () => {
    const supabase = fakeSupabase({
      client_automations: { data: null },
      clients: APPROVED_CLIENT,
      opt_outs: { data: null },
      messages: { data: null },
      review_links: { data: { clicked_at: "2026-01-01T00:00:00Z" } },
    });
    expect(
      await shouldStopReviewBlast(supabase, { ...BASE, checkClicked: false }),
    ).toEqual({ stop: false });
  });

  it("stops before the reminder once the link has been clicked", async () => {
    const supabase = fakeSupabase({
      client_automations: { data: null },
      clients: APPROVED_CLIENT,
      opt_outs: { data: null },
      messages: { data: null },
      review_links: { data: { clicked_at: "2026-01-01T00:00:00Z" } },
    });
    expect(
      await shouldStopReviewBlast(supabase, { ...BASE, checkClicked: true }),
    ).toEqual({ stop: true, reason: "clicked" });
  });

  it("does not stop when nothing blocks it", async () => {
    const supabase = fakeSupabase({
      client_automations: { data: { enabled: true, template_body: null } },
      clients: APPROVED_CLIENT,
      opt_outs: { data: null },
      messages: { data: null },
      review_links: { data: { clicked_at: null } },
    });
    expect(
      await shouldStopReviewBlast(supabase, { ...BASE, checkClicked: true }),
    ).toEqual({ stop: false });
  });
});
