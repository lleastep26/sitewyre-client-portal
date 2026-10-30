import { describe, expect, it } from "vitest";
import {
  applyTemplate,
  getDefaultTemplate,
} from "@/lib/automations";

describe("quote / appointment / invoice default templates", () => {
  it("exposes editable defaults for workflows 3, 4, and 7", () => {
    expect(getDefaultTemplate("quote_follow_up")).toContain("{{quote_number}}");
    expect(getDefaultTemplate("quote_follow_up")).toContain("{{link}}");
    expect(getDefaultTemplate("appointment_reminder")).toContain("{{when}}");
    expect(getDefaultTemplate("invoice_reminder")).toContain("{{amount}}");
    expect(getDefaultTemplate("invoice_reminder")).toContain("{{link}}");
  });

  it("fills quote follow-up vars", () => {
    expect(
      applyTemplate(getDefaultTemplate("quote_follow_up")!, {
        quote_number: "Q-12",
        business_name: "Acme",
        link: "https://x/q/t",
      }),
    ).toBe(
      "Friendly reminder: your quote Q-12 from Acme is ready: https://x/q/t",
    );
  });

  it("fills invoice reminder vars including dollar amount", () => {
    expect(
      applyTemplate(getDefaultTemplate("invoice_reminder")!, {
        business_name: "Acme",
        amount: "40.00",
        invoice_number: "INV-9",
        link: "https://x/pay/t",
      }),
    ).toBe(
      "Friendly reminder from Acme: $40.00 due on invoice INV-9. Pay: https://x/pay/t",
    );
  });

  it("fills appointment confirmation vars", () => {
    expect(
      applyTemplate(getDefaultTemplate("appointment_reminder")!, {
        business_name: "Acme",
        when: "Fri, Oct 30, 9:00 AM",
      }),
    ).toBe(
      "You're booked with Acme on Fri, Oct 30, 9:00 AM. Reply C to confirm.",
    );
  });
});
