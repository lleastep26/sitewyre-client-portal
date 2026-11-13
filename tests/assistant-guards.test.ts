import { describe, expect, it } from "vitest";
import { checkReplyGuards, detectHandoffKeyword, parseClockTimes } from "@/lib/assistant/guards";

describe("detectHandoffKeyword", () => {
  it("catches emergencies", () => {
    expect(detectHandoffKeyword("my basement is flooding right now")).toBe("emergency");
    expect(detectHandoffKeyword("I smell gas in the kitchen")).toBe("emergency");
    expect(detectHandoffKeyword("this is an EMERGENCY")).toBe("emergency");
  });

  it("catches requests for a person", () => {
    expect(detectHandoffKeyword("can I talk to a person please")).toBe("wants_person");
    expect(detectHandoffKeyword("just call me")).toBe("wants_person");
    expect(detectHandoffKeyword("is this a real person?")).toBe("wants_person");
  });

  it("leaves ordinary questions alone", () => {
    expect(detectHandoffKeyword("do you clean fireplaces?")).toBeNull();
    expect(detectHandoffKeyword("what time do you open tomorrow")).toBeNull();
  });
});

describe("parseClockTimes", () => {
  it("reads am/pm times", () => {
    expect(parseClockTimes("2pm or 4:30 PM, not 12am")).toEqual([[840], [990], [0]]);
  });

  it("treats a bare time as either am or pm", () => {
    expect(parseClockTimes("09:00–17:00")).toEqual([[540, 1260], [1020]]);
  });

  it("ignores numbers that aren't times", () => {
    expect(parseClockTimes("3 rooms, about 45 minutes")).toEqual([]);
  });
});

describe("checkReplyGuards", () => {
  const hours = "Monday: 09:00–17:00";

  it("passes a plain answer", () => {
    expect(
      checkReplyGuards("Yes, we do drain cleaning. Want me to find a time?", {
        allowedTimeText: hours,
        bookedThisRun: false,
      }),
    ).toEqual({ ok: true });
  });

  it("blocks an empty reply", () => {
    expect(checkReplyGuards("  ", { allowedTimeText: hours, bookedThisRun: false })).toEqual({
      ok: false,
      reason: "empty",
    });
  });

  it("blocks a price", () => {
    expect(
      checkReplyGuards("A service call is $89.", { allowedTimeText: hours, bookedThisRun: false }),
    ).toEqual({ ok: false, reason: "price" });
    expect(
      checkReplyGuards("About 150 dollars.", { allowedTimeText: hours, bookedThisRun: false }),
    ).toEqual({ ok: false, reason: "price" });
  });

  it("allows business hours taken from the knowledge", () => {
    expect(
      checkReplyGuards("We're open 9am to 5pm on Monday.", { allowedTimeText: hours, bookedThisRun: false }),
    ).toEqual({ ok: true });
  });

  it("blocks a time that didn't come from the knowledge, the thread or the calendar", () => {
    expect(
      checkReplyGuards("We can be there at 2pm tomorrow.", { allowedTimeText: hours, bookedThisRun: false }),
    ).toEqual({ ok: false, reason: "unverified_time" });
  });

  it("allows a time the calendar returned", () => {
    expect(
      checkReplyGuards("I have Mon 2:00 PM open. Does that work?", {
        allowedTimeText: `${hours}\nMon, Nov 16, 2:00 PM`,
        bookedThisRun: false,
      }),
    ).toEqual({ ok: true });
  });

  it("blocks a booking claim when nothing was booked", () => {
    expect(
      checkReplyGuards("Great, you're booked!", { allowedTimeText: hours, bookedThisRun: false }),
    ).toEqual({ ok: false, reason: "unconfirmed_booking" });
  });

  it("allows a booking confirmation after a real booking", () => {
    expect(
      checkReplyGuards("You're booked for Mon 2:00 PM.", {
        allowedTimeText: `${hours}\nMon, Nov 16, 2:00 PM`,
        bookedThisRun: true,
      }),
    ).toEqual({ ok: true });
  });
});
