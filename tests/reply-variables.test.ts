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

  it("fills booking and review links", () => {
    expect(
      applyReplyVariables("Book {{booking_link}} review {{review_link}}", {
        booking_link: "https://x/book/a",
        review_link: "https://g.page/r",
      }),
    ).toBe("Book https://x/book/a review https://g.page/r");
  });
});
