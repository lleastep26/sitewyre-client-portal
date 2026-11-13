import { describe, expect, it } from "vitest";
import { buildBusinessKnowledgeSummary } from "@/lib/business-knowledge/summary";

describe("buildBusinessKnowledgeSummary", () => {
  it("includes every section when fully filled in", () => {
    const summary = buildBusinessKnowledgeSummary({
      client: {
        business_name: "Acme Plumbing",
        trade: "plumbing",
        service_area: "Austin, TX",
        services_offered: "Leak repair, drain cleaning",
        after_hours_rules: "Tell the caller we'll call back in the morning.",
        ai_never_say: "Never quote a price over the phone.",
      },
      bookableServices: [{ name: "Service call", duration_minutes: 90 }],
      availability: [{ weekday: 1, start_time: "09:00:00", end_time: "17:00:00" }],
      faqs: [{ question: "Do you offer free estimates?", answer: "Yes, for most jobs." }],
    });

    expect(summary).toContain("Business: Acme Plumbing");
    expect(summary).toContain("Service area: Austin, TX");
    expect(summary).toContain("Services offered:\nLeak repair, drain cleaning");
    expect(summary).toContain("- Service call (90 min)");
    expect(summary).toContain("Monday: 09:00–17:00");
    expect(summary).toContain("After-hours rules:\nTell the caller");
    expect(summary).toContain("Q: Do you offer free estimates?");
    expect(summary).toContain("A: Yes, for most jobs.");
    expect(summary).toContain("The AI must never say:\nNever quote a price");
  });

  it("skips empty optional sections without leaving stray labels", () => {
    const summary = buildBusinessKnowledgeSummary({
      client: {
        business_name: "Acme Plumbing",
        trade: "plumbing",
        service_area: null,
        services_offered: null,
        after_hours_rules: null,
        ai_never_say: null,
      },
      bookableServices: [],
      availability: [],
      faqs: [],
    });

    expect(summary).toContain("Business: Acme Plumbing");
    expect(summary).toContain("No business hours set.");
    expect(summary).not.toContain("Service area:");
    expect(summary).not.toContain("Services offered:");
    expect(summary).not.toContain("Bookable appointment types:");
    expect(summary).not.toContain("After-hours rules:");
    expect(summary).not.toContain("FAQs:");
    expect(summary).not.toContain("The AI must never say:");
  });

  it("sorts business hours by weekday regardless of input order", () => {
    const summary = buildBusinessKnowledgeSummary({
      client: {
        business_name: "Acme",
        trade: "other",
        service_area: null,
        services_offered: null,
        after_hours_rules: null,
        ai_never_say: null,
      },
      bookableServices: [],
      availability: [
        { weekday: 5, start_time: "09:00:00", end_time: "17:00:00" },
        { weekday: 1, start_time: "08:00:00", end_time: "16:00:00" },
      ],
      faqs: [],
    });

    const mondayIndex = summary.indexOf("Monday");
    const fridayIndex = summary.indexOf("Friday");
    expect(mondayIndex).toBeGreaterThan(-1);
    expect(mondayIndex).toBeLessThan(fridayIndex);
  });
});
