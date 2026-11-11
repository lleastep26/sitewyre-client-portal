import { describe, expect, it } from "vitest";
import {
  countClickedReviewLinks,
  countMissedCallRecovery,
  countSentByTrigger,
} from "@/lib/funnels/results";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

function countChain(count: number | null) {
  const chain: {
    select: () => typeof chain;
    eq: () => typeof chain;
    gte: () => typeof chain;
    not: () => typeof chain;
    then: (resolve: (v: { count: number | null }) => void) => void;
  } = {
    select: () => chain,
    eq: () => chain,
    gte: () => chain,
    not: () => chain,
    then: (resolve) => resolve({ count }),
  };
  return chain;
}

describe("countSentByTrigger", () => {
  it("counts sent workflow_runs for the trigger since the cutoff", async () => {
    const supabase = {
      from: () => countChain(7),
    } as unknown as SupabaseClient<Database>;
    expect(
      await countSentByTrigger(supabase, "client1", "review_request", "2026-01-01"),
    ).toBe(7);
  });

  it("returns 0 when the count comes back null", async () => {
    const supabase = {
      from: () => countChain(null),
    } as unknown as SupabaseClient<Database>;
    expect(
      await countSentByTrigger(supabase, "client1", "review_request", "2026-01-01"),
    ).toBe(0);
  });
});

describe("countClickedReviewLinks", () => {
  it("counts clicked review_links for the given source", async () => {
    const supabase = {
      from: () => countChain(3),
    } as unknown as SupabaseClient<Database>;
    expect(
      await countClickedReviewLinks(supabase, "client1", "review_blast", "2026-01-01"),
    ).toBe(3);
  });
});

describe("countMissedCallRecovery", () => {
  it("counts every texted-back run, but only those whose contact replied afterward", async () => {
    const runs = [
      { created_at: "2026-01-05T00:00:00Z", log: { from: "+15551234567" } },
      { created_at: "2026-01-06T00:00:00Z", log: { from: "+15557654321" } },
      { created_at: "2026-01-07T00:00:00Z", log: { from: "+15559999999" } },
    ];
    const contactIdByPhone: Record<string, string | undefined> = {
      "+15551234567": "contact-1",
      "+15557654321": "contact-2",
      "+15559999999": undefined, // no contact on file for this number
    };
    const repliedContactIds = new Set(["contact-1"]);

    let lastPhone = "";
    let lastContactId = "";
    const supabase = {
      from(table: string) {
        if (table === "workflow_runs") {
          const chain: Record<string, unknown> = {};
          chain.select = () => chain;
          chain.eq = () => chain;
          chain.gte = () => chain;
          chain.then = (resolve: (v: { data: unknown }) => void) =>
            resolve({ data: runs });
          return chain;
        }
        if (table === "contacts") {
          const chain: Record<string, unknown> = {};
          chain.select = () => chain;
          chain.eq = () => chain;
          chain.contains = (_col: string, val: string[]) => {
            lastPhone = val[0];
            return chain;
          };
          chain.limit = () => chain;
          chain.maybeSingle = async () => {
            const id = contactIdByPhone[lastPhone];
            return { data: id ? { id } : null };
          };
          return chain;
        }
        if (table === "messages") {
          const chain: Record<string, unknown> = {};
          chain.select = () => chain;
          chain.eq = (col: string, val: string) => {
            if (col === "contact_id") lastContactId = val;
            return chain;
          };
          chain.gt = () => chain;
          chain.limit = () => chain;
          chain.maybeSingle = async () => ({
            data: repliedContactIds.has(lastContactId) ? { id: "msg1" } : null,
          });
          return chain;
        }
        throw new Error(`unexpected table ${table}`);
      },
    } as unknown as SupabaseClient<Database>;

    const result = await countMissedCallRecovery(supabase, "client1", "2026-01-01");
    expect(result).toEqual({ textedBack: 3, recovered: 1 });
  });
});
