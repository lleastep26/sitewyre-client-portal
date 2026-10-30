import { describe, expect, it } from "vitest";
import {
  hourInTimeZone,
  isQuietHours,
  nextSendableAt,
} from "@/lib/scheduling/quiet-hours";

const TZ = "America/Chicago";

describe("quiet hours", () => {
  it("detects evening quiet hours in Chicago", () => {
    // 2026-11-02 22:00 CST = 2026-11-03T04:00:00.000Z
    const late = new Date("2026-11-03T04:00:00.000Z");
    expect(hourInTimeZone(late, TZ)).toBe(22);
    expect(isQuietHours(late, TZ)).toBe(true);
  });

  it("allows mid-day sends", () => {
    // 2026-11-02 12:00 CST = 2026-11-02T18:00:00.000Z
    const noon = new Date("2026-11-02T18:00:00.000Z");
    expect(isQuietHours(noon, TZ)).toBe(false);
    expect(nextSendableAt(noon, TZ).getTime()).toBe(noon.getTime());
  });

  it("defers late night to after 8am local", () => {
    const late = new Date("2026-11-03T04:00:00.000Z"); // 22:00 CST
    const sendAt = nextSendableAt(late, TZ);
    expect(isQuietHours(sendAt, TZ)).toBe(false);
    expect(hourInTimeZone(sendAt, TZ)).toBeGreaterThanOrEqual(8);
  });
});
