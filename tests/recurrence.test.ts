import { describe, expect, it } from "vitest";
import {
  expandRecurrence,
  parseRecurrenceRule,
} from "@/lib/scheduling/recurrence";

describe("expandRecurrence", () => {
  it("parses known rules", () => {
    expect(parseRecurrenceRule("weekly")).toBe("weekly");
    expect(parseRecurrenceRule("BiWeekly")).toBe("biweekly");
    expect(parseRecurrenceRule("nope")).toBeNull();
  });

  it("expands weekly within 90 days", () => {
    const start = new Date("2026-11-02T15:00:00.000Z");
    const dates = expandRecurrence({ start, rule: "weekly", horizonDays: 90 });
    expect(dates[0].toISOString()).toBe(start.toISOString());
    expect(dates.length).toBeGreaterThan(10);
    expect(dates.length).toBeLessThanOrEqual(14);
    const last = dates[dates.length - 1];
    expect(last.getTime() - start.getTime()).toBeLessThanOrEqual(
      90 * 24 * 60 * 60 * 1000,
    );
  });

  it("expands biweekly fewer times than weekly", () => {
    const start = new Date("2026-11-02T15:00:00.000Z");
    const weekly = expandRecurrence({ start, rule: "weekly" });
    const biweekly = expandRecurrence({ start, rule: "biweekly" });
    expect(biweekly.length).toBeLessThan(weekly.length);
  });
});
