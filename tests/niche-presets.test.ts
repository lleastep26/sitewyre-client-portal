import { describe, expect, it, vi, beforeEach } from "vitest";
import { getTradePreset, TRADE_PRESETS } from "@/lib/trade-presets";
import { applyTradePreset } from "@/lib/crm/apply-trade-preset";

describe("niche presets", () => {
  it("gives every preset a full set of labels", () => {
    for (const [key, preset] of Object.entries(TRADE_PRESETS)) {
      expect(preset.labels.jobNounSingular, key).toBeTruthy();
      expect(preset.labels.jobNounPlural, key).toBeTruthy();
      expect(preset.labels.customerNoun, key).toBeTruthy();
    }
  });

  it("uses contractor labels for every contractor trade", () => {
    for (const trade of ["roofing", "hvac", "plumbing", "cleaning", "landscaping", "electrical", "painting", "general_contractor", "other"]) {
      const labels = getTradePreset(trade).labels;
      expect(labels.jobNounPlural).toBe("Jobs");
      expect(labels.customerNoun).toBe("customer");
    }
  });

  it("gives med_spa appointment/client labels and its two appointment types", () => {
    const preset = getTradePreset("med_spa");
    expect(preset.labels).toEqual({
      jobNounSingular: "Appointment",
      jobNounPlural: "Appointments",
      customerNoun: "client",
    });
    expect(preset.services.map((s) => s.name)).toEqual(["Consultation", "Treatment"]);
  });

  it("gives veterinary appointment/pet owner labels and its two appointment types", () => {
    const preset = getTradePreset("veterinary");
    expect(preset.labels).toEqual({
      jobNounSingular: "Appointment",
      jobNounPlural: "Appointments",
      customerNoun: "pet owner",
    });
    expect(preset.services.map((s) => s.name)).toEqual(["Checkup", "Sick visit"]);
  });

  it("falls back to the generic 'other' preset for an unrecognized niche", () => {
    expect(getTradePreset("underwater_basket_weaving").trade).toBe("other");
  });
});

describe("applyTradePreset idempotency across a niche change", () => {
  function fakeSupabase(opts: { stagesCount: number; servicesCount: number; onInsert: (table: string, rows: unknown) => void }) {
    return {
      from(table: string) {
        return {
          select: () => ({
            eq: () => ({
              then: (resolve: (v: { count: number }) => void) => {
                resolve({ count: table === "pipeline_stages" ? opts.stagesCount : opts.servicesCount });
              },
            }),
          }),
          insert: (rows: unknown) => {
            opts.onInsert(table, rows);
            return Promise.resolve({ error: null });
          },
        };
      },
    };
  }

  beforeEach(() => vi.clearAllMocks());

  it("seeds stages/services for a brand-new client", async () => {
    const inserted: { table: string; rows: unknown }[] = [];
    const supabase = fakeSupabase({
      stagesCount: 0,
      servicesCount: 0,
      onInsert: (table, rows) => inserted.push({ table, rows }),
    });
    await applyTradePreset(supabase as never, "client1", "veterinary");
    expect(inserted.some((i) => i.table === "pipeline_stages")).toBe(true);
    expect(inserted.some((i) => i.table === "services")).toBe(true);
  });

  it("never re-seeds stages/services once a client already has them, even for a different niche", async () => {
    const inserted: { table: string; rows: unknown }[] = [];
    const supabase = fakeSupabase({
      stagesCount: 6,
      servicesCount: 2,
      onInsert: (table, rows) => inserted.push({ table, rows }),
    });
    await applyTradePreset(supabase as never, "client1", "med_spa");
    expect(inserted).toHaveLength(0);
  });
});
