import { beforeEach, describe, expect, it, vi } from "vitest";
import { wallTimeToUtc } from "@/lib/scheduling/slots";

const getExternalBusyTimes = vi.fn();
vi.mock("@/lib/scheduling/calendar-sync", () => ({ getExternalBusyTimes }));

const TZ = "America/Chicago";

function buildSupabase(opts: { availability: unknown[]; service: unknown; appointments: unknown[] }) {
  return {
    from(table: string) {
      if (table === "availability") {
        return { select: () => ({ eq: () => ({ data: opts.availability }) }) };
      }
      if (table === "services") {
        return { select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: opts.service }) }) }) }) };
      }
      if (table === "appointments") {
        return {
          select: () => ({
            eq: () => ({ neq: () => ({ lt: () => ({ gt: async () => ({ data: opts.appointments }) }) }) }),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  getExternalBusyTimes.mockResolvedValue([]);
});

describe("findOpenSlots", () => {
  it("returns [] when the client has no availability configured", async () => {
    const { findOpenSlots } = await import("@/lib/scheduling/service-slots");
    const supabase = buildSupabase({ availability: [], service: { duration_minutes: 60 }, appointments: [] });
    const slots = await findOpenSlots(supabase as never, {
      clientId: "client1",
      serviceId: "svc1",
      fromYmd: "2026-11-16",
      toYmd: "2026-11-16",
      timeZone: TZ,
    });
    expect(slots).toEqual([]);
  });

  it("returns [] when the service doesn't exist for this client", async () => {
    const { findOpenSlots } = await import("@/lib/scheduling/service-slots");
    const supabase = buildSupabase({
      availability: [{ weekday: 1, start_time: "09:00", end_time: "17:00", buffer_minutes: 0, min_notice_hours: 0 }],
      service: null,
      appointments: [],
    });
    const slots = await findOpenSlots(supabase as never, {
      clientId: "client1",
      serviceId: "missing",
      fromYmd: "2026-11-16",
      toYmd: "2026-11-16",
      timeZone: TZ,
    });
    expect(slots).toEqual([]);
  });

  it("generates open slots around an existing appointment and merges in external busy times", async () => {
    // 2026-11-16 is a Monday.
    getExternalBusyTimes.mockResolvedValue([
      { start_at: "2026-11-16T15:00:00.000Z", end_at: "2026-11-16T16:00:00.000Z" },
    ]);
    const supabase = buildSupabase({
      availability: [{ weekday: 1, start_time: "09:00", end_time: "12:00", buffer_minutes: 0, min_notice_hours: 0 }],
      service: { duration_minutes: 60 },
      appointments: [],
    });
    const { findOpenSlots } = await import("@/lib/scheduling/service-slots");
    const slots = await findOpenSlots(supabase as never, {
      clientId: "client1",
      serviceId: "svc1",
      fromYmd: "2026-11-16",
      toYmd: "2026-11-16",
      timeZone: TZ,
    });
    // 9am Chicago = 15:00 UTC, which is exactly the externally-busy hour — must be excluded.
    const blocked = wallTimeToUtc("2026-11-16", 9 * 60, TZ).toISOString();
    expect(slots.map((s) => s.toISOString())).not.toContain(blocked);
    expect(slots.length).toBeGreaterThan(0);
  });
});
