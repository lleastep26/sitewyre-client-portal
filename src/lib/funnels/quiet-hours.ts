/**
 * Funnel send window: 9am-7pm in the client's timezone — the funnels plan's
 * own acceptance criterion ("no message ever sends outside 9am to 7pm").
 * This is intentionally separate from src/lib/scheduling/quiet-hours.ts
 * (9pm-8am), which the 5 existing automations already use — funnels never
 * change that shared default.
 */

import { hourInTimeZone } from "@/lib/scheduling/quiet-hours";

const FUNNEL_WINDOW_START_HOUR = 9;
const FUNNEL_WINDOW_END_HOUR = 19;

export function isWithinFunnelWindow(date: Date, timeZone: string): boolean {
  const hour = hourInTimeZone(date, timeZone);
  return hour >= FUNNEL_WINDOW_START_HOUR && hour < FUNNEL_WINDOW_END_HOUR;
}

/**
 * If `date` falls outside the 9am-7pm window, returns the next instant
 * at/after 9am local. Otherwise returns `date`.
 */
export function nextFunnelSendableAt(date: Date, timeZone: string): Date {
  if (isWithinFunnelWindow(date, timeZone)) return date;
  let cursor = new Date(date.getTime());
  for (let i = 0; i < 60; i += 1) {
    cursor = new Date(cursor.getTime() + 15 * 60_000);
    if (isWithinFunnelWindow(cursor, timeZone)) return cursor;
  }
  return cursor;
}
