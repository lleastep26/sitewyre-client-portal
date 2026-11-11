/**
 * Plans when every review-blast message (first text + its +3d reminder)
 * actually sends, so the shared 40/day cap is enforced deterministically
 * at confirm time rather than reactively inside sleeping functions —
 * reactive per-contact checks would race each other with no way to
 * atomically claim "slot 40 of 40" across many independent Inngest runs.
 *
 * Scope: this correctly fills a single import batch's own first-sends and
 * reminders into the client's daily cap, accounting for whatever the
 * client has already sent today. It does not reserve capacity against a
 * *different*, still-in-flight batch's future reminders (there's nowhere
 * that's tracked yet) — a second CSV import while the first is still
 * sending its +3d reminders could, in principle, land a few sends over
 * cap on a shared future day. Flagged rather than solved with a queue
 * table, since the common case is one import per client.
 */

export const BLAST_DAILY_CAP = 40;
const WINDOW_START_HOUR = 9;
const WINDOW_END_HOUR = 19;
const WINDOW_MINUTES = (WINDOW_END_HOUR - WINDOW_START_HOUR) * 60;
const SLOT_SPACING_MINUTES = WINDOW_MINUTES / BLAST_DAILY_CAP;

type LocalParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
};

function localParts(date: Date, timeZone: string): LocalParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "numeric",
    minute: "numeric",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value ?? "0");
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
  };
}

/**
 * The UTC instant corresponding to a specific local wall-clock date+time
 * in `timeZone`, found by convergence against Intl's own rendering — no
 * tz-database dependency, and correct across DST since each iteration
 * re-measures the actual local time the guess renders as.
 */
export function zonedTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
): Date {
  let guess = new Date(Date.UTC(year, month - 1, day, hour, minute));
  for (let i = 0; i < 3; i++) {
    const got = localParts(guess, timeZone);
    const dayDiffMs =
      Date.UTC(got.year, got.month - 1, got.day) -
      Date.UTC(year, month - 1, day);
    const gotMinutes = dayDiffMs / 60_000 + got.hour * 60 + got.minute;
    const wantMinutes = hour * 60 + minute;
    const diff = wantMinutes - gotMinutes;
    if (diff === 0) return guess;
    guess = new Date(guess.getTime() + diff * 60_000);
  }
  return guess;
}

/** Midnight local time, as a UTC instant — used to query "how many sent
 * today already" without a tz-database dependency. */
export function startOfTodayInTimeZone(now: Date, timeZone: string): Date {
  const { year, month, day } = localParts(now, timeZone);
  return zonedTimeToUtc(year, month, day, 0, 0, timeZone);
}

export type BlastSlot = { dayOffset: number; firstSendAt: Date; reminderSendAt: Date };

/**
 * Greedily fills days starting from `now`, respecting `alreadySentToday`
 * (other sends this client has already made today), spacing slots evenly
 * across the 9am-7pm window, and pushing both first-sends and reminders
 * to the next day with room once a day hits the cap. First-sends for the
 * whole batch are allocated before any reminders, so a new contact's
 * initial outreach takes priority over a 3-day-later follow-up when days
 * are tight.
 */
export function planBlastSchedule<T>(
  rows: T[],
  opts: { timeZone: string; now?: Date; alreadySentToday?: number },
): Array<T & BlastSlot> {
  const now = opts.now ?? new Date();
  const base = localParts(now, opts.timeZone);
  const baseDateUtcMs = Date.UTC(base.year, base.month - 1, base.day);

  const usage = new Map<number, number>();
  usage.set(0, opts.alreadySentToday ?? 0);
  const usageOn = (day: number) => usage.get(day) ?? 0;

  function reserve(minDayOffset: number): { dayOffset: number; slotIndex: number } {
    let day = minDayOffset;
    while (usageOn(day) >= BLAST_DAILY_CAP) day++;
    const slotIndex = usageOn(day);
    usage.set(day, slotIndex + 1);
    return { dayOffset: day, slotIndex };
  }

  function slotToDate(dayOffset: number, slotIndex: number): Date {
    const targetMs = baseDateUtcMs + dayOffset * 86_400_000;
    const target = new Date(targetMs);
    const minutesIntoWindow = slotIndex * SLOT_SPACING_MINUTES;
    const hour = WINDOW_START_HOUR + Math.floor(minutesIntoWindow / 60);
    const minute = minutesIntoWindow % 60;
    return zonedTimeToUtc(
      target.getUTCFullYear(),
      target.getUTCMonth() + 1,
      target.getUTCDate(),
      hour,
      minute,
      opts.timeZone,
    );
  }

  const firstSlots = rows.map(() => reserve(0));
  const firstDates = firstSlots.map((s) => slotToDate(s.dayOffset, s.slotIndex));

  return rows.map((row, i) => {
    const reminderSlot = reserve(firstSlots[i].dayOffset + 3);
    return {
      ...row,
      dayOffset: firstSlots[i].dayOffset,
      firstSendAt: firstDates[i],
      reminderSendAt: slotToDate(reminderSlot.dayOffset, reminderSlot.slotIndex),
    };
  });
}
