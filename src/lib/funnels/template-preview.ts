/**
 * Pure, dependency-free helpers for the Automations page's "live preview
 * with sample data" feature. No DB access, so these run client-side as the
 * owner types, with no round-trip.
 */

const GENERIC_SAMPLE_VALUES: Record<string, string> = {
  first_name: "Alex",
  business_name: "Your Business",
  when: "Thu 2:00pm",
  quote_number: "Q-1042",
  invoice_number: "INV-2031",
  amount: "240",
  link: "https://sitewyre.com/l/sample",
  phone: "(555) 019-2834",
  review_link: "https://sitewyre.com/r/sample",
  job_type: "gutter cleaning",
  owner_name: "the owner",
};

/** Unique {{variable}} names in the template, in order of first appearance. */
export function extractTemplateVariables(template: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const match of template.matchAll(/{{\s*([a-z_]+)\s*}}/g)) {
    const name = match[1];
    if (!seen.has(name)) {
      seen.add(name);
      out.push(name);
    }
  }
  return out;
}

/** Sample values for preview, preferring the client's real data where set. */
export function buildSampleTemplateValues(client: {
  business_name?: string | null;
  owner_name?: string | null;
  phone?: string | null;
}): Record<string, string> {
  return {
    ...GENERIC_SAMPLE_VALUES,
    business_name: client.business_name || GENERIC_SAMPLE_VALUES.business_name,
    owner_name: client.owner_name || GENERIC_SAMPLE_VALUES.owner_name,
    phone: client.phone || GENERIC_SAMPLE_VALUES.phone,
  };
}

/** Replaces known {{vars}}; leaves any unrecognized placeholder as-is so a
 * typo or unsupported variable stays visible rather than disappearing. */
export function renderTemplatePreview(
  template: string,
  values: Record<string, string>,
): string {
  return template.replace(/{{\s*([a-z_]+)\s*}}/g, (full, name: string) =>
    name in values ? values[name] : full,
  );
}
