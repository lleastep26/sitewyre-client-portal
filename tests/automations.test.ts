import { describe, expect, it } from "vitest";
import { AUTOMATION_DEFS, applyTemplate } from "@/lib/automations";

describe("missed_call_text_back automation", () => {
  it("is registered in AUTOMATION_DEFS with a template", () => {
    const def = AUTOMATION_DEFS.find((d) => d.key === "missed_call_text_back");
    expect(def).toBeTruthy();
    expect(def?.defaultTemplate).toContain("{{business_name}}");
  });

  it("applies business_name in the default SMS body", () => {
    const def = AUTOMATION_DEFS.find((d) => d.key === "missed_call_text_back");
    expect(
      applyTemplate(def!.defaultTemplate!, { business_name: "Acme Clean" }),
    ).toBe("Sorry we missed your call to Acme Clean. How can we help?");
  });
});
