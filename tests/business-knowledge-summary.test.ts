import { describe, expect, it } from "vitest";
import {
  buildBusinessKnowledgeSummary,
  buildRetellBeginMessage,
  buildRetellGeneralPrompt,
  buildChatWidgetPrompt,
  buildTextAssistantPrompt,
} from "@/lib/business-knowledge/summary";

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

describe("buildRetellBeginMessage", () => {
  it("discloses it's a virtual assistant and that the call may be recorded", () => {
    const msg = buildRetellBeginMessage("Acme Plumbing");
    expect(msg).toContain("Acme Plumbing");
    expect(msg).toContain("virtual assistant");
    expect(msg).toContain("may be recorded");
  });

  it("falls back to a generic name when the business has none set", () => {
    expect(buildRetellBeginMessage(null)).toContain("us");
  });
});

describe("buildRetellGeneralPrompt name and number checks", () => {
  it("asks callers to spell an unclear name and reads back name and number before ending", () => {
    const prompt = buildRetellGeneralPrompt({
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
    expect(prompt).toContain("ask them to spell it if the name is unusual");
    expect(prompt).toContain("not completely sure you heard it right");
    expect(prompt).toContain("Could you spell that for me so I get it right?");
    // Spelling is settled before the lead is saved.
    expect(prompt.indexOf("ask them to spell it")).toBeLessThan(prompt.indexOf("Call create_or_update_lead once"));
    expect(prompt).toContain("{{caller_number}}");
    expect(prompt).toContain("read back their name and that phone number");
    expect(prompt).toContain("call create_or_update_lead again with the corrected caller_name and caller_phone");
  });
});

describe("buildRetellGeneralPrompt", () => {
  it("includes the knowledge summary plus the fixed behavior rules", () => {
    const prompt = buildRetellGeneralPrompt({
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
    expect(prompt).toContain("Business: Acme Plumbing");
    expect(prompt).toContain("flag_emergency");
    expect(prompt).toContain("911");
    expect(prompt).toContain("check_availability");
    expect(prompt).toContain("book_appointment");
    expect(prompt).toContain("create_or_update_lead");
  });
});

describe("buildTextAssistantPrompt", () => {
  const input = {
    client: {
      business_name: "Acme Plumbing",
      trade: "plumbing",
      service_area: null,
      services_offered: null,
      after_hours_rules: null,
      ai_never_say: "Never mention competitors.",
    },
    bookableServices: [{ name: "Service call", duration_minutes: 90 }],
    availability: [],
    faqs: [],
  };

  it("includes the business knowledge and the rules from the spec", () => {
    const prompt = buildTextAssistantPrompt(input);
    expect(prompt).toContain("Business: Acme Plumbing");
    expect(prompt).toContain("- Service call (90 min)");
    expect(prompt).toContain("Never mention competitors.");
    expect(prompt).toContain("check_availability");
    expect(prompt).toContain("book_appointment");
    expect(prompt).toContain("hand_off_to_owner");
    expect(prompt).toMatch(/Never state or estimate a price/);
    expect(prompt).toMatch(/Never promise an arrival time/);
  });

  it("is identical between calls, so it can be prompt-cached", () => {
    expect(buildTextAssistantPrompt(input)).toBe(buildTextAssistantPrompt(input));
    expect(buildTextAssistantPrompt(input)).not.toMatch(/\b20\d\d\b/);
  });
});

describe("buildChatWidgetPrompt", () => {
  it("answers from the knowledge only, with no prices, promises or booking tools", () => {
    const prompt = buildChatWidgetPrompt({
      client: {
        business_name: "Acme Plumbing",
        trade: "plumbing",
        service_area: "Austin, TX",
        services_offered: null,
        after_hours_rules: null,
        ai_never_say: null,
      },
      bookableServices: [],
      availability: [],
      faqs: [{ question: "Do you offer warranties?", answer: "Yes, one year." }],
    });
    expect(prompt).toContain("Business: Acme Plumbing");
    expect(prompt).toContain("Q: Do you offer warranties?");
    expect(prompt).toMatch(/Never state or estimate a price/);
    expect(prompt).toMatch(/You can't book appointments/);
    expect(prompt).toContain("team_will_follow_up");
    expect(prompt).not.toContain("check_availability");
  });
});

describe("assistants never point customers at their internal notes", () => {
  const input = {
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
  };

  it.each([
    ["text assistant", buildTextAssistantPrompt],
    ["chat widget", buildChatWidgetPrompt],
    ["phone receptionist", buildRetellGeneralPrompt],
  ])("%s prompt says not to mention them", (_name, build) => {
    const prompt = build(input);
    expect(prompt).toContain('never refer to them or to "business knowledge"');
    expect(prompt).toContain("you don't have that information");
  });
});
