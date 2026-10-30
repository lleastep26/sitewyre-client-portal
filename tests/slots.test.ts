import { describe, expect, it } from "vitest";
import {
  generateSlots,
  isSlotAvailable,
  wallTimeToUtc,
} from "@/lib/scheduling/slots";

const TZ = "America/Chicago";

describe("wallTimeToUtc", () => {
  it("maps Chicago wall time to the correct UTC instant", () => {
    // 2026-11-02 is CST (UTC-6)
    const d = wallTimeToUtc("2026-11-02", 9 * 60, TZ);
    expect(d.toISOString()).toBe("2026-11-02T15:00:00.000Z");
  });
});

describe("generateSlots", () => {
  it("returns 30-min slots within Mon 9–5 that fit a 60-min service", () => {
    // Fixed Monday 2026-11-02
    const monday = wallTimeToUtc("2026-11-02", 0, TZ);
    const now = wallTimeToUtc("2026-11-01", 8 * 60, TZ); // Sunday before
    const slots = generateSlots({
      dateFrom: monday,
      dateTo: monday,
      durationMinutes: 60,
      now,
      timeZone: TZ,
      availability: [
        {
          weekday: 1,
          start_time: "09:00:00",
          end_time: "17:00:00",
          buffer_minutes: 0,
          min_notice_hours: 0,
        },
      ],
      busy: [],
      stepMinutes: 30,
    });
    expect(slots[0]?.toISOString()).toBe("2026-11-02T15:00:00.000Z"); // 9am CT
    const last = slots[slots.length - 1]!;
    // last start that fits 60m before 17:00 CT is 16:00 CT = 22:00Z
    expect(last.toISOString()).toBe("2026-11-02T22:00:00.000Z");
    expect(slots.length).toBe(15); // 9:00 … 16:00 every 30m
  });

  it("skips slots that overlap busy + buffer", () => {
    const monday = wallTimeToUtc("2026-11-02", 0, TZ);
    const now = wallTimeToUtc("2026-11-01", 8 * 60, TZ);
    const busyStart = wallTimeToUtc("2026-11-02", 11 * 60, TZ);
    const busyEnd = wallTimeToUtc("2026-11-02", 12 * 60, TZ);
    const slots = generateSlots({
      dateFrom: monday,
      dateTo: monday,
      durationMinutes: 60,
      now,
      timeZone: TZ,
      availability: [
        {
          weekday: 1,
          start_time: "09:00",
          end_time: "17:00",
          buffer_minutes: 15,
          min_notice_hours: 0,
        },
      ],
      busy: [
        {
          start_at: busyStart.toISOString(),
          end_at: busyEnd.toISOString(),
        },
      ],
      stepMinutes: 30,
    });
    const hours = slots.map((s) => {
      // interpret back in Chicago for assertions
      const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: TZ,
        hour: "numeric",
        minute: "2-digit",
        hourCycle: "h23",
      }).formatToParts(s);
      const h = Number(parts.find((p) => p.type === "hour")?.value);
      const m = Number(parts.find((p) => p.type === "minute")?.value);
      return h + m / 60;
    });
    expect(hours).toContain(9);
    expect(hours).toContain(9.5);
    expect(hours).not.toContain(10);
    expect(hours).not.toContain(10.5);
    expect(hours).not.toContain(11);
    expect(hours).toContain(12.5);
  });

  it("respects min notice", () => {
    const monday = wallTimeToUtc("2026-11-02", 0, TZ);
    const now = wallTimeToUtc("2026-11-02", 8 * 60, TZ); // Monday 8am CT
    const slots = generateSlots({
      dateFrom: monday,
      dateTo: monday,
      durationMinutes: 30,
      now,
      timeZone: TZ,
      availability: [
        {
          weekday: 1,
          start_time: "09:00",
          end_time: "11:00",
          buffer_minutes: 0,
          min_notice_hours: 2,
        },
      ],
      busy: [],
      stepMinutes: 30,
    });
    // earliest allowed = 10:00 CT = 16:00Z
    expect(slots[0]?.toISOString()).toBe("2026-11-02T16:00:00.000Z");
  });
});

describe("isSlotAvailable", () => {
  it("returns true for an open slot", () => {
    const start = wallTimeToUtc("2026-11-02", 9 * 60, TZ);
    const now = wallTimeToUtc("2026-11-01", 8 * 60, TZ);
    expect(
      isSlotAvailable({
        start,
        durationMinutes: 60,
        now,
        timeZone: TZ,
        availability: [
          {
            weekday: 1,
            start_time: "09:00",
            end_time: "17:00",
            buffer_minutes: 0,
            min_notice_hours: 0,
          },
        ],
        busy: [],
      }),
    ).toBe(true);
  });
});
