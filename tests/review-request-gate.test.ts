import { describe, expect, it } from "vitest";
import { shouldStopReviewDrip } from "@/lib/funnels/review-request-gate";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

function fakeSupabase(responses: Record<string, { data: unknown }>) {
  return {
    from(table: string) {
      const result = responses[table] ?? { data: null };
      const chain = {
        select: () => chain,
        eq: () => chain,
        contains: () => chain,
        gt: () => chain,
        limit: () => chain,
        maybeSingle: async () => result,
      };
      return chain;
    },
  } as unknown as SupabaseClient<Database>;
}

const BASE_PARAMS = {
  clientId: "client1",
  phone: "+15551234567",
  contactId: "contact1",
  completedAt: new Date(Date.now() - 60_000).toISOString(),
  reviewToken: "tok123",
};

const APPROVED_CLIENT = { data: { a2p_status: "approved", phone: "+19995550000" } };

describe("shouldStopReviewDrip", () => {
  it("stops when the automation is disabled", async () => {
    const supabase = fakeSupabase({
      client_automations: { data: { enabled: false, template_body: null } },
      clients: APPROVED_CLIENT,
    });
    expect(await shouldStopReviewDrip(supabase, BASE_PARAMS)).toEqual({
      stop: true,
      reason: "disabled",
    });
  });

  it("stops when A2P isn't approved, before checking opt-out/reply/click", async () => {
    const supabase = fakeSupabase({
      client_automations: { data: null },
      clients: { data: { a2p_status: "pending", phone: "+19995550000" } },
      opt_outs: { data: null },
      messages: { data: null },
      review_links: { data: { clicked_at: null } },
    });
    expect(await shouldStopReviewDrip(supabase, BASE_PARAMS)).toEqual({
      stop: true,
      reason: "a2p_pending",
    });
  });

  it("does not stop on A2P when the destination is the client's own phone (contractor alert)", async () => {
    const supabase = fakeSupabase({
      client_automations: { data: null },
      clients: { data: { a2p_status: "pending", phone: BASE_PARAMS.phone } },
      opt_outs: { data: null },
      messages: { data: null },
      review_links: { data: { clicked_at: null } },
    });
    expect(await shouldStopReviewDrip(supabase, BASE_PARAMS)).toEqual({
      stop: false,
      templateBody: null,
    });
  });

  it("stops when the phone is opted out", async () => {
    const supabase = fakeSupabase({
      client_automations: { data: null },
      clients: APPROVED_CLIENT,
      opt_outs: { data: { phone: BASE_PARAMS.phone } },
    });
    expect(await shouldStopReviewDrip(supabase, BASE_PARAMS)).toEqual({
      stop: true,
      reason: "opted_out",
    });
  });

  it("stops when the contact has replied since the funnel started", async () => {
    const supabase = fakeSupabase({
      client_automations: { data: null },
      clients: APPROVED_CLIENT,
      opt_outs: { data: null },
      messages: { data: { id: "msg1" } },
    });
    expect(await shouldStopReviewDrip(supabase, BASE_PARAMS)).toEqual({
      stop: true,
      reason: "replied",
    });
  });

  it("stops once the tracked link has been clicked", async () => {
    const supabase = fakeSupabase({
      client_automations: { data: null },
      clients: APPROVED_CLIENT,
      opt_outs: { data: null },
      messages: { data: null },
      review_links: { data: { clicked_at: "2026-01-01T00:00:00Z" } },
    });
    expect(await shouldStopReviewDrip(supabase, BASE_PARAMS)).toEqual({
      stop: true,
      reason: "clicked",
    });
  });

  it("does not stop, and surfaces the template override, when nothing blocks it", async () => {
    const supabase = fakeSupabase({
      client_automations: {
        data: { enabled: true, template_body: "Custom {{review_link}}" },
      },
      clients: APPROVED_CLIENT,
      opt_outs: { data: null },
      messages: { data: null },
      review_links: { data: { clicked_at: null } },
    });
    expect(await shouldStopReviewDrip(supabase, BASE_PARAMS)).toEqual({
      stop: false,
      templateBody: "Custom {{review_link}}",
    });
  });
});
