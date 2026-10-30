import { describe, expect, it } from "vitest";
import { monthLabel, monthStartIso } from "@/lib/billing/usage";

describe("billing usage month helpers", () => {
  it("returns UTC start of month", () => {
    expect(monthStartIso(new Date("2026-10-30T21:00:00.000Z"))).toBe(
      "2026-10-01T00:00:00.000Z",
    );
  });

  it("labels the UTC month", () => {
    expect(monthLabel(new Date("2026-10-30T21:00:00.000Z"))).toBe(
      "October 2026",
    );
  });
});
