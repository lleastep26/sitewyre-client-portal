import { describe, expect, it } from "vitest";
import { forwardingGuide, formatUsPhone } from "@/lib/phone/forwarding-instructions";

const NUMBER = "+14058834432";

describe("forwardingGuide", () => {
  it("Verizon: *71 plus the 10-digit number, *73 to turn off", () => {
    const g = forwardingGuide("verizon", NUMBER);
    expect(g.unconfirmed).toBe(false);
    expect(g.turnOn.map((s) => s.code)).toEqual(["*714058834432"]);
    expect(g.turnOff.map((s) => s.code)).toEqual(["*73"]);
  });

  it("T-Mobile: the three conditional codes with 1 + number, and the ring-time example", () => {
    const g = forwardingGuide("tmobile", NUMBER);
    expect(g.unconfirmed).toBe(false);
    expect(g.turnOn.map((s) => s.code)).toEqual([
      "**61*14058834432#",
      "**67*14058834432#",
      "**62*14058834432#",
      "**61*14058834432**20#",
    ]);
    expect(g.turnOff[0].code).toBe("##004#");
  });

  it("AT&T is marked unconfirmed", () => {
    const g = forwardingGuide("att", NUMBER);
    expect(g.unconfirmed).toBe(true);
    expect(g.turnOn[0].code).toBe("**004*14058834432#");
    expect(g.turnOff.map((s) => s.code)).toEqual(["##004#"]);
    expect(g.notes.join(" ")).toContain("AT&T's own support pages don't confirm them");
  });

  it("other providers get wording to give their phone company, not codes", () => {
    const g = forwardingGuide("other", NUMBER);
    expect(g.turnOn).toEqual([]);
    expect(g.notes[0]).toContain("(405) 883-4432");
    expect(g.notes.join(" ")).toContain("forward all calls");
  });
});

describe("formatUsPhone", () => {
  it("formats US numbers and leaves anything else as it is", () => {
    expect(formatUsPhone("+14058834432")).toBe("(405) 883-4432");
    expect(formatUsPhone("4058834432")).toBe("(405) 883-4432");
    expect(formatUsPhone(null)).toBe("");
    expect(formatUsPhone("+442071234567")).toBe("+442071234567");
  });
});
