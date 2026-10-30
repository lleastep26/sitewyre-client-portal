import { describe, expect, it } from "vitest";
import { applyReplyVariables } from "@/lib/inbox/variables";

describe("applyReplyVariables", () => {
  it("fills first_name and business_name", () => {
    expect(
      applyReplyVariables("Hi {{first_name}} from {{business_name}}", {
        first_name: "Sam",
        business_name: "Acme",
      }),
    ).toBe("Hi Sam from Acme");
  });
});
