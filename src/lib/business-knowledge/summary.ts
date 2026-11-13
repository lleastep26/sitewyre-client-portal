import { weekdayLabel, type AvailabilityRow } from "@/lib/scheduling/availability";
import type { ClientFaqRow, ClientRow, ServiceRow } from "@/lib/supabase/types";

export type BusinessKnowledgeInput = {
  client: Pick<
    ClientRow,
    | "business_name"
    | "trade"
    | "service_area"
    | "services_offered"
    | "after_hours_rules"
    | "ai_never_say"
  >;
  bookableServices: Pick<ServiceRow, "name" | "duration_minutes">[];
  availability: Pick<AvailabilityRow, "weekday" | "start_time" | "end_time">[];
  faqs: Pick<ClientFaqRow, "question" | "answer">[];
};

function formatHours(availability: BusinessKnowledgeInput["availability"]): string {
  if (!availability.length) return "No business hours set.";
  return [...availability]
    .sort((a, b) => a.weekday - b.weekday)
    .map((a) => `${weekdayLabel(a.weekday)}: ${a.start_time.slice(0, 5)}–${a.end_time.slice(0, 5)}`)
    .join("\n");
}

/**
 * The single source of business context for the AI receptionist, text
 * assistant and chat widget (Blocks 6-8) — nothing consumes this yet,
 * this just builds it correctly from the Business knowledge page.
 */
export function buildBusinessKnowledgeSummary(input: BusinessKnowledgeInput): string {
  const { client, bookableServices, availability, faqs } = input;
  const sections: string[] = [];

  sections.push(`Business: ${client.business_name ?? "Unknown"}`);
  if (client.service_area) sections.push(`Service area: ${client.service_area}`);

  if (client.services_offered) {
    sections.push(`Services offered:\n${client.services_offered}`);
  }

  if (bookableServices.length) {
    sections.push(
      "Bookable appointment types:\n" +
        bookableServices
          .map((s) => `- ${s.name} (${s.duration_minutes} min)`)
          .join("\n"),
    );
  }

  sections.push(`Business hours:\n${formatHours(availability)}`);

  if (client.after_hours_rules) {
    sections.push(`After-hours rules:\n${client.after_hours_rules}`);
  }

  if (faqs.length) {
    sections.push(
      "FAQs:\n" + faqs.map((f) => `Q: ${f.question}\nA: ${f.answer}`).join("\n\n"),
    );
  }

  if (client.ai_never_say) {
    sections.push(`The AI must never say:\n${client.ai_never_say}`);
  }

  return sections.join("\n\n");
}

/** First thing the AI receptionist says — must disclose it's a virtual
 * assistant and that the call may be recorded, per the build spec. */
export function buildRetellBeginMessage(businessName: string | null | undefined): string {
  const name = businessName?.trim() || "us";
  return `Hi, you've reached ${name}, I'm their virtual assistant, and this call may be recorded. How can I help?`;
}

/** The Retell LLM's general_prompt: the business knowledge summary plus
 * the fixed behavior rules every AI receptionist must follow. */
export function buildRetellGeneralPrompt(input: BusinessKnowledgeInput): string {
  const summary = buildBusinessKnowledgeSummary(input);
  const rules = [
    "You are the AI phone receptionist for this business, answering live phone calls.",
    "Never invent facts, quote prices, or promise a specific time or outcome you haven't confirmed with a tool call.",
    "If the caller describes a genuine emergency (active flooding, a gas smell, fire, or any danger to life), tell them to call 911 immediately if there is any danger, then call the flag_emergency function.",
    "Call check_availability before offering a specific appointment time, and book_appointment only once the caller has agreed to a specific time.",
    "Call create_or_update_lead as soon as you know the caller's name and why they're calling, even if they don't end up booking.",
  ].join("\n\n");
  return `${summary}\n\n${rules}`;
}
