import { describe, expect, it } from "vitest";
import { isOptedOut, smsBlockReason } from "@/lib/funnels/opt-out";
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
        limit: () => chain,
        maybeSingle: async () => result,
      };
      return chain;
    },
  } as unknown as SupabaseClient<Database>;
}

describe("isOptedOut", () => {
  it("returns true when the phone has a row in opt_outs — the exact case a missed review-request skip relies on", async () => {
    const supabase = fakeSupabase({
      opt_outs: { data: { phone: "+14055438920" } },
    });
    expect(await isOptedOut(supabase, "client1", "+14055438920")).toBe(true);
  });

  it("returns false when there is no opt_outs row and no contact to check", async () => {
    const supabase = fakeSupabase({ opt_outs: { data: null } });
    expect(await isOptedOut(supabase, "client1", "+14055438920")).toBe(false);
  });

  it("returns true when the contact's sms_opt_in is explicitly false", async () => {
    const supabase = fakeSupabase({
      opt_outs: { data: null },
      contacts: { data: { sms_opt_in: false } },
    });
    expect(
      await isOptedOut(supabase, "client1", "+14055438920", "contact1"),
    ).toBe(true);
  });

  it("returns false when the contact's sms_opt_in is true (the default — never a false positive)", async () => {
    const supabase = fakeSupabase({
      opt_outs: { data: null },
      contacts: { data: { sms_opt_in: true } },
    });
    expect(
      await isOptedOut(supabase, "client1", "+14055438920", "contact1"),
    ).toBe(false);
  });

  it("blocks by phone number alone when the caller doesn't know the contact (the instant reply's case)", async () => {
    const supabase = fakeSupabase({
      opt_outs: { data: null },
      contacts: { data: { sms_opt_in: false } },
    });
    expect(await isOptedOut(supabase, "client1", "+14055438920")).toBe(true);
  });
});

describe("smsBlockReason", () => {
  it("says opted_out for a real STOP, even when the contact also has no consent", async () => {
    const supabase = fakeSupabase({
      opt_outs: { data: { phone: "+14055438920" } },
      contacts: { data: { sms_opt_in: false } },
    });
    expect(await smsBlockReason(supabase, "client1", "+14055438920", "contact1")).toBe("opted_out");
  });

  it("says no_sms_consent when the contact never agreed to texts and there's no STOP", async () => {
    const supabase = fakeSupabase({
      opt_outs: { data: null },
      contacts: { data: { sms_opt_in: false } },
    });
    expect(await smsBlockReason(supabase, "client1", "405-543-8920")).toBe("no_sms_consent");
  });

  it("returns null when nothing blocks the text", async () => {
    const supabase = fakeSupabase({
      opt_outs: { data: null },
      contacts: { data: null },
    });
    expect(await smsBlockReason(supabase, "client1", "+14055438920")).toBeNull();
  });
});
