import { describe, expect, it } from "vitest";
import { generateSlots, isSlotAvailable } from "@/lib/scheduling/slots";

describe("generateSlots", () => {
  it("returns 30-min slots within Mon 9–5 that fit a 60-min service", () => {
    // Fixed Monday 2026-11-02
    const monday = new Date(2026, 10, 2, 0, 0, 0);
    const now = new Date(2026, 10, 1, 8, 0, 0); // Sunday before
    const slots = generateSlots({
      dateFrom: monday,
      dateTo: monday,
      durationMinutes: 60,
      now,
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
    expect(slots[0]?.getHours()).toBe(9);
    expect(slots[0]?.getMinutes()).toBe(0);
    const last = slots[slots.length - 1]!;
    // last start that fits 60m before 17:00 is 16:00
    expect(last.getHours()).toBe(16);
    expect(last.getMinutes()).toBe(0);
    expect(slots.length).toBe(15); // 9:00 … 16:00 every 30m
  });

  it("skips slots that overlap busy + buffer", () => {
    const monday = new Date(2026, 10, 2, 0, 0, 0);
    const now = new Date(2026, 10, 1, 8, 0, 0);
    const busyStart = new Date(2026, 10, 2, 11, 0, 0);
    const busyEnd = new Date(2026, 10, 2, 12, 0, 0);
    const slots = generateSlots({
      dateFrom: monday,
      dateTo: monday,
      durationMinutes: 60,
      now,
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
    const hours = slots.map((s) => s.getHours() + s.getMinutes() / 60);
    // 9:00 ends 10:00 — clear of 11:00−15m buffer
    expect(hours).toContain(9);
    // 9:30→10:30 clear; 10:00→11:00 hits buffer at 10:45
    expect(hours).toContain(9.5);
    expect(hours).not.toContain(10);
    expect(hours).not.toContain(10.5);
    expect(hours).not.toContain(11);
    // after busy+buffer (12:15): 12:30 ok
    expect(hours).toContain(12.5);
  });

  it("respects min notice", () => {
    const monday = new Date(2026, 10, 2, 0, 0, 0);
    const now = new Date(2026, 10, 2, 8, 0, 0); // Monday 8am
    const slots = generateSlots({
      dateFrom: monday,
      dateTo: monday,
      durationMinutes: 30,
      now,
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
    // earliest allowed = 10:00
    expect(slots[0]?.getHours()).toBe(10);
  });
});

describe("isSlotAvailable", () => {
  it("returns true for an open slot", () => {
    const start = new Date(2026, 10, 2, 9, 0, 0);
    const now = new Date(2026, 10, 1, 8, 0, 0);
    expect(
      isSlotAvailable({
        start,
        durationMinutes: 60,
        now,
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
