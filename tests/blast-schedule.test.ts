import { describe, expect, it } from "vitest";
import {
  BLAST_DAILY_CAP,
  planBlastSchedule,
  startOfTodayInTimeZone,
  zonedTimeToUtc,
} from "@/lib/funnels/blast-schedule";

const TZ = "America/Chicago";
// A fixed, DST-unambiguous reference instant (winter, CST = UTC-6), at
// local 8am so every test starts before the 9am-7pm window opens.
const NOW = new Date("2026-01-15T14:00:00.000Z"); // 08:00 America/Chicago

function dayKey(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function hourOf(date: Date, timeZone: string): number {
  return Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour: "numeric",
      hourCycle: "h23",
    }).format(date),
  );
}

describe("zonedTimeToUtc", () => {
  it("resolves 9am Central (winter, CST = UTC-6) to the correct UTC instant", () => {
    const utc = zonedTimeToUtc(2026, 1, 15, 9, 0, TZ);
    expect(utc.toISOString()).toBe("2026-01-15T15:00:00.000Z");
  });
});

describe("planBlastSchedule — mid-day import", () => {
  it("never schedules a slot in the past when the import happens mid-afternoon", () => {
    // 3:07pm America/Chicago — well past the 9am window open, the exact
    // real-world case that first surfaced this: slot 0 (9am) had already
    // passed, so an Inngest sleepUntil for it would fire immediately
    // instead of respecting the window.
    const midAfternoon = new Date("2026-01-15T21:07:00.000Z");
    const rows = [{ phone: "+15550001" }];
    const [scheduled] = planBlastSchedule(rows, { timeZone: TZ, now: midAfternoon });
    expect(scheduled.firstSendAt.getTime()).toBeGreaterThan(midAfternoon.getTime());
  });

  it("pushes to day 1 when the import happens after the window has closed", () => {
    const afterClose = new Date("2026-01-16T02:00:00.000Z"); // 8pm Chicago, Jan 15
    const rows = [{ phone: "+15550001" }];
    const [scheduled] = planBlastSchedule(rows, { timeZone: TZ, now: afterClose });
    const sameDay = dayKey(afterClose, TZ);
    const scheduledDay = dayKey(scheduled.firstSendAt, TZ);
    expect(scheduledDay).not.toBe(sameDay);
    expect(scheduled.firstSendAt.getTime()).toBeGreaterThan(afterClose.getTime());
  });
});

describe("planBlastSchedule", () => {
  it("schedules every send within the 9am-7pm local window", () => {
    const rows = Array.from({ length: 10 }, (_, i) => ({ phone: `+1555000${i}` }));
    const scheduled = planBlastSchedule(rows, { timeZone: TZ, now: NOW });
    for (const row of scheduled) {
      const firstHour = hourOf(row.firstSendAt, TZ);
      const reminderHour = hourOf(row.reminderSendAt, TZ);
      expect(firstHour).toBeGreaterThanOrEqual(9);
      expect(firstHour).toBeLessThan(19);
      expect(reminderHour).toBeGreaterThanOrEqual(9);
      expect(reminderHour).toBeLessThan(19);
    }
  });

  it("fills exactly the daily cap on day 0 before spilling to day 1", () => {
    const rows = Array.from(
      { length: BLAST_DAILY_CAP + 1 },
      (_, i) => ({ phone: `+1555${String(i).padStart(4, "0")}` }),
    );
    const scheduled = planBlastSchedule(rows, { timeZone: TZ, now: NOW });

    const day0Key = dayKey(NOW, TZ);
    const firstSendDayKeys = scheduled.map((r) => dayKey(r.firstSendAt, TZ));
    const onDay0 = firstSendDayKeys.filter((k) => k === day0Key).length;

    expect(onDay0).toBe(BLAST_DAILY_CAP);
    // the 41st row's first send must land on a later day, not day 0
    expect(firstSendDayKeys[BLAST_DAILY_CAP]).not.toBe(day0Key);
  });

  it("respects alreadySentToday when filling day 0", () => {
    const rows = Array.from({ length: 5 }, (_, i) => ({ phone: `+1555000${i}` }));
    const scheduled = planBlastSchedule(rows, {
      timeZone: TZ,
      now: NOW,
      alreadySentToday: BLAST_DAILY_CAP - 2,
    });

    const day0Key = dayKey(NOW, TZ);
    const onDay0 = scheduled.filter(
      (r) => dayKey(r.firstSendAt, TZ) === day0Key,
    ).length;
    // only 2 slots were left on day 0
    expect(onDay0).toBe(2);
  });

  it("pushes a reminder to the next day when its +3d day is already full", () => {
    // 41 rows: the first 40 land on day 0, so all 40 of their reminders
    // want day 3 — exactly filling day 3's cap. The 41st row's first send
    // lands on day 1, so its reminder wants day 4 (not day 3, which is
    // already full) — confirms reminders aren't pushed somewhere wrong
    // when a day fills from OTHER rows' reminders, not just first-sends.
    const rows = Array.from(
      { length: BLAST_DAILY_CAP + 1 },
      (_, i) => ({ phone: `+1555${String(i).padStart(4, "0")}` }),
    );
    const scheduled = planBlastSchedule(rows, { timeZone: TZ, now: NOW });

    const day3Key = dayKey(
      new Date(NOW.getTime() + 3 * 86_400_000),
      TZ,
    );
    const remindersOnDay3 = scheduled.filter(
      (r) => dayKey(r.reminderSendAt, TZ) === day3Key,
    ).length;
    expect(remindersOnDay3).toBe(BLAST_DAILY_CAP);

    // the 41st row (first send on day 1) should NOT have its reminder on
    // day 3 — day 3 is already full from the other 40.
    const lastRowReminderDay = dayKey(scheduled[BLAST_DAILY_CAP].reminderSendAt, TZ);
    expect(lastRowReminderDay).not.toBe(day3Key);
  });

  it("spaces slots apart within the same day, not all at the same instant", () => {
    const rows = Array.from({ length: 5 }, (_, i) => ({ phone: `+1555000${i}` }));
    const scheduled = planBlastSchedule(rows, { timeZone: TZ, now: NOW });
    const times = scheduled.map((r) => r.firstSendAt.getTime());
    const unique = new Set(times);
    expect(unique.size).toBe(5);
    // strictly increasing
    for (let i = 1; i < times.length; i++) {
      expect(times[i]).toBeGreaterThan(times[i - 1]);
    }
  });
});

describe("startOfTodayInTimeZone", () => {
  it("returns local midnight as a UTC instant", () => {
    const start = startOfTodayInTimeZone(NOW, TZ);
    expect(start.toISOString()).toBe("2026-01-15T06:00:00.000Z"); // midnight CST
  });
});
