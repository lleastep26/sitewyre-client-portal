export type RecurrenceRule = "weekly" | "biweekly" | "monthly";

export function parseRecurrenceRule(
  value: string | null | undefined,
): RecurrenceRule | null {
  if (!value) return null;
  const v = value.trim().toLowerCase();
  if (v === "weekly" || v === "biweekly" || v === "monthly") return v;
  return null;
}

/**
 * Materialize occurrence starts from an anchor, inclusive of the first,
 * within a horizon (default 90 days). Does not include dates after horizon.
 */
export function expandRecurrence(opts: {
  start: Date;
  rule: RecurrenceRule;
  horizonDays?: number;
}): Date[] {
  const horizonDays = opts.horizonDays ?? 90;
  const end = new Date(opts.start.getTime() + horizonDays * 24 * 60 * 60 * 1000);
  const out: Date[] = [new Date(opts.start.getTime())];
  let cursor = new Date(opts.start.getTime());

  while (out.length < 200) {
    if (opts.rule === "weekly") {
      cursor = new Date(cursor.getTime() + 7 * 24 * 60 * 60 * 1000);
    } else if (opts.rule === "biweekly") {
      cursor = new Date(cursor.getTime() + 14 * 24 * 60 * 60 * 1000);
    } else {
      const next = new Date(cursor.getTime());
      next.setUTCMonth(next.getUTCMonth() + 1);
      cursor = next;
    }
    if (cursor.getTime() > end.getTime()) break;
    out.push(new Date(cursor.getTime()));
  }

  return out;
}
