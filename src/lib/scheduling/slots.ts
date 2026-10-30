export type AvailabilityWindow = {
  weekday: number; // 0=Sun … 6=Sat
  start_time: string; // HH:MM or HH:MM:SS
  end_time: string;
  buffer_minutes: number;
  min_notice_hours: number;
};

export type BusyInterval = {
  start_at: string; // ISO
  end_at: string;
};

export type SlotOptions = {
  dateFrom: Date;
  dateTo: Date;
  durationMinutes: number;
  availability: AvailabilityWindow[];
  busy: BusyInterval[];
  /** Slot grid step in minutes (default 30). */
  stepMinutes?: number;
  /** Now for min-notice (default Date.now()). */
  now?: Date;
  /** IANA timezone for interpreting availability wall times (default: runtime local). */
  timeZone?: string;
};

function parseTimeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function ymdFromDate(d: Date, timeZone?: string): string {
  if (!timeZone) {
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  }
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const y = parts.find((p) => p.type === "year")?.value;
  const m = parts.find((p) => p.type === "month")?.value;
  const day = parts.find((p) => p.type === "day")?.value;
  return `${y}-${m}-${day}`;
}

function eachYmd(from: Date, to: Date, timeZone?: string): string[] {
  const start = ymdFromDate(from, timeZone);
  const end = ymdFromDate(to, timeZone);
  const out: string[] = [];
  let cur = new Date(`${start}T12:00:00.000Z`);
  const last = new Date(`${end}T12:00:00.000Z`);
  while (cur.getTime() <= last.getTime()) {
    out.push(cur.toISOString().slice(0, 10));
    cur = new Date(cur.getTime() + 86_400_000);
  }
  return out;
}

/**
 * UTC instant for a wall-clock date/time in `timeZone`.
 * When `timeZone` is omitted, uses the runtime's local timezone.
 */
export function wallTimeToUtc(
  ymd: string,
  minutesFromMidnight: number,
  timeZone?: string,
): Date {
  const [ys, ms, ds] = ymd.split("-").map(Number);
  const hour = Math.floor(minutesFromMidnight / 60);
  const minute = minutesFromMidnight % 60;

  if (!timeZone) {
    return new Date(ys!, (ms ?? 1) - 1, ds ?? 1, hour, minute, 0, 0);
  }

  const want = `${ymd} ${pad2(hour)}:${pad2(minute)}`;
  let lo = Date.UTC(ys!, (ms ?? 1) - 1, ds ?? 1, hour, minute) - 14 * 3_600_000;
  let hi = Date.UTC(ys!, (ms ?? 1) - 1, ds ?? 1, hour, minute) + 14 * 3_600_000;

  const label = (msUtc: number) => {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date(msUtc));
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
    return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}`;
  };

  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2 / 60_000) * 60_000;
    const got = label(mid);
    if (got < want) lo = mid + 60_000;
    else if (got > want) hi = mid - 60_000;
    else return new Date(mid);
  }
  return new Date(lo);
}

function weekdayForYmd(ymd: string, timeZone?: string): number {
  const noon = wallTimeToUtc(ymd, 12 * 60, timeZone);
  if (!timeZone) return noon.getDay();
  const wd = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
  }).format(noon);
  const map: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return map[wd] ?? noon.getUTCDay();
}

function overlaps(
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number,
): boolean {
  return aStart < bEnd && aEnd > bStart;
}

/**
 * Generate open start times that fit `durationMinutes` within weekly
 * availability windows, respecting buffer around busy appointments and
 * minimum notice hours.
 */
export function generateSlots(opts: SlotOptions): Date[] {
  const step = opts.stepMinutes ?? 30;
  const now = opts.now ?? new Date();
  const durationMs = opts.durationMinutes * 60_000;
  const slots: Date[] = [];
  const timeZone = opts.timeZone;

  const maxBuffer = Math.max(
    0,
    ...opts.availability.map((a) => a.buffer_minutes),
  );
  const maxNotice = Math.max(
    0,
    ...opts.availability.map((a) => a.min_notice_hours),
  );

  const busyMs = opts.busy.map((b) => ({
    start: new Date(b.start_at).getTime() - maxBuffer * 60_000,
    end: new Date(b.end_at).getTime() + maxBuffer * 60_000,
  }));

  for (const ymd of eachYmd(opts.dateFrom, opts.dateTo, timeZone)) {
    const weekday = weekdayForYmd(ymd, timeZone);
    const windows = opts.availability.filter((a) => a.weekday === weekday);
    for (const win of windows) {
      const startMin = parseTimeToMinutes(win.start_time);
      const endMin = parseTimeToMinutes(win.end_time);
      const noticeMs = (win.min_notice_hours || maxNotice) * 3_600_000;
      const earliest = now.getTime() + noticeMs;

      for (let m = startMin; m + opts.durationMinutes <= endMin; m += step) {
        const slotStart = wallTimeToUtc(ymd, m, timeZone);
        const slotEndMs = slotStart.getTime() + durationMs;
        if (slotStart.getTime() < earliest) continue;

        const conflict = busyMs.some((b) =>
          overlaps(slotStart.getTime(), slotEndMs, b.start, b.end),
        );
        if (conflict) continue;
        slots.push(slotStart);
      }
    }
  }

  return slots;
}

/** True if the proposed interval is free given availability + busy + buffer. */
export function isSlotAvailable(opts: {
  start: Date;
  durationMinutes: number;
  availability: AvailabilityWindow[];
  busy: BusyInterval[];
  now?: Date;
  timeZone?: string;
}): boolean {
  const slots = generateSlots({
    dateFrom: opts.start,
    dateTo: opts.start,
    durationMinutes: opts.durationMinutes,
    availability: opts.availability,
    busy: opts.busy,
    now: opts.now,
    timeZone: opts.timeZone,
    stepMinutes: 1,
  });
  const target = opts.start.getTime();
  return slots.some((s) => Math.abs(s.getTime() - target) < 60_000);
}
