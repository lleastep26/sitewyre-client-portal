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

describe("shouldStopReviewDrip", () => {
  it("stops when the automation is disabled", async () => {
    const supabase = fakeSupabase({
      client_automations: { data: { enabled: false, template_body: null } },
    });
    expect(await shouldStopReviewDrip(supabase, BASE_PARAMS)).toEqual({
      stop: true,
      reason: "disabled",
    });
  });

  it("stops when the phone is opted out", async () => {
    const supabase = fakeSupabase({
      client_automations: { data: null },
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
