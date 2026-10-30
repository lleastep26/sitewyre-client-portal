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
  /** IANA timezone used when interpreting local wall times (optional display only). */
  timeZone?: string;
};

function parseTimeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
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

  const from = startOfLocalDay(opts.dateFrom);
  const to = startOfLocalDay(opts.dateTo);

  for (let day = from; day <= to; day = addDays(day, 1)) {
    const weekday = day.getDay();
    const windows = opts.availability.filter((a) => a.weekday === weekday);
    for (const win of windows) {
      const startMin = parseTimeToMinutes(win.start_time);
      const endMin = parseTimeToMinutes(win.end_time);
      const noticeMs = (win.min_notice_hours || maxNotice) * 3_600_000;
      const earliest = now.getTime() + noticeMs;

      for (let m = startMin; m + opts.durationMinutes <= endMin; m += step) {
        const slotStart = new Date(
          day.getFullYear(),
          day.getMonth(),
          day.getDate(),
          Math.floor(m / 60),
          m % 60,
          0,
          0,
        );
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
}): boolean {
  const slots = generateSlots({
    dateFrom: opts.start,
    dateTo: opts.start,
    durationMinutes: opts.durationMinutes,
    availability: opts.availability,
    busy: opts.busy,
    now: opts.now,
    stepMinutes: 1,
  });
  const target = opts.start.getTime();
  return slots.some((s) => Math.abs(s.getTime() - target) < 60_000);
}
