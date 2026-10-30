import { describe, expect, it } from "vitest";
import {
  SPEED_TO_LEAD_SLA_MINUTES,
  formatWaitingLabel,
  isPastSpeedToLeadSla,
  minutesWaiting,
  slaCutoffIso,
} from "@/lib/leads/speed-to-lead";

describe("speed-to-lead SLA helpers", () => {
  const now = new Date("2026-10-30T16:00:00.000Z");

  it("cuts off at SPEED_TO_LEAD_SLA_MINUTES before now", () => {
    const cutoff = new Date(slaCutoffIso(now));
    expect(
      (now.getTime() - cutoff.getTime()) / 60_000,
    ).toBe(SPEED_TO_LEAD_SLA_MINUTES);
  });

  it("flags unanswered leads older than the SLA", () => {
    expect(
      isPastSpeedToLeadSla(
        {
          created_at: "2026-10-30T15:40:00.000Z",
          first_response_at: null,
        },
        now,
      ),
    ).toBe(true);
  });

  it("does not flag fresh or answered leads", () => {
    expect(
      isPastSpeedToLeadSla(
        {
          created_at: "2026-10-30T15:50:00.000Z",
          first_response_at: null,
        },
        now,
      ),
    ).toBe(false);
    expect(
      isPastSpeedToLeadSla(
        {
          created_at: "2026-10-30T15:00:00.000Z",
          first_response_at: "2026-10-30T15:05:00.000Z",
        },
        now,
      ),
    ).toBe(false);
  });

  it("formats waiting ages", () => {
    expect(minutesWaiting("2026-10-30T15:40:00.000Z", now)).toBe(20);
    expect(formatWaitingLabel(20)).toBe("20m waiting");
    expect(formatWaitingLabel(75)).toBe("1h 15m waiting");
    expect(formatWaitingLabel(120)).toBe("2h waiting");
  });
});
