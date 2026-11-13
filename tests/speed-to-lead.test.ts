import { describe, expect, it } from "vitest";
import {
  SPEED_TO_LEAD_SLA_MINUTES,
  SPEED_TO_LEAD_SLA_SLEEP,
  formatWaitingLabel,
  isPastSpeedToLeadSla,
  minutesWaiting,
  shouldNudgeOwnerForSla,
  slaNudgeOutcome,
  slaCutoffIso,
} from "@/lib/leads/speed-to-lead";
import { AUTOMATION_DEFS } from "@/lib/automations";

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

  it("exposes Inngest sleep matching the SLA minutes", () => {
    expect(SPEED_TO_LEAD_SLA_SLEEP).toBe(`${SPEED_TO_LEAD_SLA_MINUTES}m`);
  });

  it("nudges only unanswered existing leads", () => {
    expect(
      shouldNudgeOwnerForSla({ id: "1", first_response_at: null }),
    ).toBe(true);
    expect(
      shouldNudgeOwnerForSla({
        id: "1",
        first_response_at: "2026-10-30T15:05:00.000Z",
      }),
    ).toBe(false);
    expect(shouldNudgeOwnerForSla(null)).toBe(false);
  });

  it("registers lead_sla_nudge automation with owner template", () => {
    const def = AUTOMATION_DEFS.find((d) => d.key === "lead_sla_nudge");
    expect(def?.defaultTemplate).toContain("{{first_name}}");
    expect(def?.defaultTemplate).toContain("{{phone}}");
  });
});

describe("slaNudgeOutcome", () => {
  it("is skipped, with the reason, when there is no owner phone and no push key", () => {
    expect(slaNudgeOutcome({ ownerPhone: null, push: { skipped: true } })).toEqual({
      status: "skipped",
      sms: "no_owner_phone",
      push: "no_push_key",
      reason: "no_owner_phone_and_no_push_key",
    });
  });

  it("is skipped when push is set up but no device is subscribed", () => {
    expect(slaNudgeOutcome({ ownerPhone: "", push: { sent: 0 } })).toEqual({
      status: "skipped",
      sms: "no_owner_phone",
      push: "no_push_devices",
      reason: "no_owner_phone_and_no_push_devices",
    });
  });

  it("is sent when the owner has a mobile number", () => {
    expect(slaNudgeOutcome({ ownerPhone: "+14055550100", push: { skipped: true } })).toEqual({
      status: "sent",
      sms: "sent",
      push: "no_push_key",
    });
  });

  it("is sent when a push reached a device", () => {
    expect(slaNudgeOutcome({ ownerPhone: null, push: { sent: 2 } })).toMatchObject({
      status: "sent",
      push: "sent",
    });
  });
});
