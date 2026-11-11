import { describe, expect, it } from "vitest";
import { buildReviewBlastPreview } from "@/lib/funnels/review-blast-preview";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

type Scripted = {
  optOuts?: Set<string>;
  contactsByPhone?: Map<string, string>;
  recentContacts?: Set<string>;
};

function fakeSupabase(script: Scripted): SupabaseClient<Database> {
  return {
    from(table: string) {
      if (table === "opt_outs") {
        const chain = {
          select: () => chain,
          eq(_col: string, val: string) {
            (chain as unknown as { _phone?: string })._phone = val;
            return chain;
          },
          maybeSingle: async () => {
            const phone = (chain as unknown as { _phone?: string })._phone;
            const found = phone && script.optOuts?.has(phone);
            return { data: found ? { phone } : null };
          },
        } as Record<string, unknown>;
        return chain;
      }
      if (table === "contacts") {
        const chain = {
          select: () => chain,
          eq: () => chain,
          contains(_col: string, val: string[]) {
            (chain as unknown as { _phone?: string })._phone = val[0];
            return chain;
          },
          limit: () => chain,
          maybeSingle: async () => {
            const phone = (chain as unknown as { _phone?: string })._phone;
            const id = phone ? script.contactsByPhone?.get(phone) : undefined;
            return { data: id ? { id } : null };
          },
        } as Record<string, unknown>;
        return chain;
      }
      if (table === "review_links") {
        const chain = {
          select: () => chain,
          eq(_col: string, val: string) {
            (chain as unknown as { _contactId?: string })._contactId = val;
            return chain;
          },
          gte: () => chain,
          order: () => chain,
          limit: () => chain,
          maybeSingle: async () => {
            const contactId = (chain as unknown as { _contactId?: string })
              ._contactId;
            const recent = contactId && script.recentContacts?.has(contactId);
            return { data: recent ? { created_at: new Date().toISOString() } : null };
          },
        } as Record<string, unknown>;
        return chain;
      }
      const chain = {
        select: () => chain,
        eq: () => chain,
        maybeSingle: async () => ({ data: null }),
      };
      return chain;
    },
  } as unknown as SupabaseClient<Database>;
}

const CSV_HEADER = "first_name,phone,job_type,job_date\n";

describe("buildReviewBlastPreview", () => {
  it("classifies a clean row as valid", async () => {
    const supabase = fakeSupabase({});
    const preview = await buildReviewBlastPreview(
      supabase,
      "client1",
      CSV_HEADER + "Sam,4055551111,Roof,2026-01-01\n",
    );
    expect(preview.valid).toHaveLength(1);
    expect(preview.valid[0].phone).toBe("+14055551111");
    expect(preview.skipped).toHaveLength(0);
  });

  it("skips a missing phone", async () => {
    const supabase = fakeSupabase({});
    const preview = await buildReviewBlastPreview(
      supabase,
      "client1",
      CSV_HEADER + "Sam,,Roof,2026-01-01\n",
    );
    expect(preview.skipped).toEqual([
      expect.objectContaining({ reason: "missing_phone" }),
    ]);
  });

  it("skips an unparseable phone number as bad_number", async () => {
    const supabase = fakeSupabase({});
    const preview = await buildReviewBlastPreview(
      supabase,
      "client1",
      CSV_HEADER + "Sam,12,Roof,2026-01-01\n",
    );
    expect(preview.skipped[0].reason).toBe("bad_number");
  });

  it("skips the second occurrence of a duplicate phone within the file", async () => {
    const supabase = fakeSupabase({});
    const preview = await buildReviewBlastPreview(
      supabase,
      "client1",
      CSV_HEADER +
        "Sam,4055551111,Roof,2026-01-01\nSamuel,4055551111,Gutter,2026-02-01\n",
    );
    expect(preview.valid).toHaveLength(1);
    expect(preview.valid[0].firstName).toBe("Sam");
    expect(preview.skipped).toEqual([
      expect.objectContaining({ reason: "duplicate", firstName: "Samuel" }),
    ]);
  });

  it("skips a number that is in opt_outs", async () => {
    const supabase = fakeSupabase({ optOuts: new Set(["+14055551111"]) });
    const preview = await buildReviewBlastPreview(
      supabase,
      "client1",
      CSV_HEADER + "Sam,4055551111,Roof,2026-01-01\n",
    );
    expect(preview.skipped[0].reason).toBe("opted_out");
  });

  it("skips a phone matching an existing contact asked within the last 90 days", async () => {
    const supabase = fakeSupabase({
      contactsByPhone: new Map([["+14055551111", "contact1"]]),
      recentContacts: new Set(["contact1"]),
    });
    const preview = await buildReviewBlastPreview(
      supabase,
      "client1",
      CSV_HEADER + "Sam,4055551111,Roof,2026-01-01\n",
    );
    expect(preview.skipped[0].reason).toBe("recent_review_request");
  });

  it("treats an existing contact with no recent request as valid", async () => {
    const supabase = fakeSupabase({
      contactsByPhone: new Map([["+14055551111", "contact1"]]),
    });
    const preview = await buildReviewBlastPreview(
      supabase,
      "client1",
      CSV_HEADER + "Sam,4055551111,Roof,2026-01-01\n",
    );
    expect(preview.valid).toHaveLength(1);
  });
});
