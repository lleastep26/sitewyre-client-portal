/** Quiet hours: 9pm–8am in the client timezone (inclusive of 21:00, exclusive of 08:00). */

export function hourInTimeZone(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    hourCycle: "h23",
  }).formatToParts(date);
  return Number(parts.find((p) => p.type === "hour")?.value ?? "0");
}

export function isQuietHours(
  date: Date,
  timeZone: string,
  quietStartHour = 21,
  quietEndHour = 8,
): boolean {
  const hour = hourInTimeZone(date, timeZone);
  return hour >= quietStartHour || hour < quietEndHour;
}

/**
 * If `date` falls in quiet hours, returns the next instant at/after quiet end
 * (default 8:00 local). Otherwise returns `date`.
 */
export function nextSendableAt(
  date: Date,
  timeZone: string,
  quietStartHour = 21,
  quietEndHour = 8,
): Date {
  if (!isQuietHours(date, timeZone, quietStartHour, quietEndHour)) {
    return date;
  }
  let cursor = new Date(date.getTime());
  // Walk forward in 15-minute steps until outside quiet hours (max ~14h).
  for (let i = 0; i < 60; i += 1) {
    cursor = new Date(cursor.getTime() + 15 * 60_000);
    if (!isQuietHours(cursor, timeZone, quietStartHour, quietEndHour)) {
      return cursor;
    }
  }
  return cursor;
}
