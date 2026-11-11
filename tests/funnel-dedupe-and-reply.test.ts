import { describe, expect, it } from "vitest";
import { hasRecentSend } from "@/lib/funnels/dedupe";
import { hasRepliedSince } from "@/lib/funnels/human-reply";
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
        gte: () => chain,
        limit: () => chain,
        maybeSingle: async () => result,
      };
      return chain;
    },
  } as unknown as SupabaseClient<Database>;
}

describe("hasRecentSend (missed-call 24h de-dupe)", () => {
  it("returns true when a matching sent workflow_runs row exists in the window", async () => {
    const supabase = fakeSupabase({
      workflow_runs: { data: { id: "run1" } },
    });
    expect(
      await hasRecentSend(supabase, {
        clientId: "client1",
        trigger: "missed_call_text_back",
        phone: "+15551234567",
      }),
    ).toBe(true);
  });

  it("returns false when no matching row exists — safe to send", async () => {
    const supabase = fakeSupabase({ workflow_runs: { data: null } });
    expect(
      await hasRecentSend(supabase, {
        clientId: "client1",
        trigger: "missed_call_text_back",
        phone: "+15551234567",
      }),
    ).toBe(false);
  });
});

describe("hasRepliedSince (review-funnel human takeover)", () => {
  it("returns true when the contact has an inbound message after the funnel started", async () => {
    const supabase = fakeSupabase({
      messages: { data: { id: "msg1" } },
    });
    expect(
      await hasRepliedSince(
        supabase,
        "contact1",
        new Date(Date.now() - 60_000).toISOString(),
      ),
    ).toBe(true);
  });

  it("returns false when there is no inbound message since the funnel started", async () => {
    const supabase = fakeSupabase({ messages: { data: null } });
    expect(
      await hasRepliedSince(
        supabase,
        "contact1",
        new Date(Date.now() - 60_000).toISOString(),
      ),
    ).toBe(false);
  });
});
