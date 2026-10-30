import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

export const AUTOMATION_DEFS = [
  {
    key: "lead_auto_reply",
    label: "1. Lead auto-reply + owner alert",
    defaultTemplate:
      "Hi {{first_name}}, thanks for contacting {{business_name}}.",
  },
  {
    key: "lead_unanswered_follow_up",
    label: "2. Unanswered lead follow-up (2 days)",
    defaultTemplate:
      "Hi {{first_name}}, just checking in from {{business_name}} — still happy to help whenever you're ready.",
  },
  {
    key: "quote_follow_up",
    label: "3. Quote follow-ups (3d + 7d)",
    defaultTemplate: null,
  },
  {
    key: "appointment_reminder",
    label: "4. Appointment confirm + 24h + 2h",
    defaultTemplate: null,
  },
  {
    key: "on_my_way",
    label: "5. On-my-way SMS",
    defaultTemplate: "{{business_name}}: we're on the way.",
  },
  {
    key: "review_request",
    label: "6. Review request on complete",
    defaultTemplate:
      "Thanks for choosing {{business_name}}! Mind leaving a quick review?",
  },
  {
    key: "invoice_reminder",
    label: "7. Invoice reminders (3d + 7d if unpaid)",
    defaultTemplate: null,
  },
  {
    key: "rebooking_nudge",
    label: "8. Rebooking nudge (14d after complete)",
    defaultTemplate:
      "Hi from {{business_name}} — ready to book your next visit?",
  },
  {
    key: "missed_call_text_back",
    label: "9. Missed-call text-back (30s)",
    defaultTemplate:
      "Sorry we missed your call to {{business_name}}. How can we help?",
  },
] as const;

export type AutomationKey = (typeof AUTOMATION_DEFS)[number]["key"];

export async function ensureClientAutomations(
  supabase: SupabaseClient<Database>,
  clientId: string,
) {
  const rows = AUTOMATION_DEFS.map((d) => ({
    client_id: clientId,
    trigger: d.key,
    enabled: true,
    template_body: d.defaultTemplate,
  }));
  await supabase.from("client_automations").upsert(rows, {
    onConflict: "client_id,trigger",
    ignoreDuplicates: true,
  });
}

export async function getAutomationState(
  supabase: SupabaseClient<Database>,
  clientId: string,
  trigger: string,
): Promise<{ enabled: boolean; templateBody: string | null }> {
  const { data } = await supabase
    .from("client_automations")
    .select("enabled, template_body")
    .eq("client_id", clientId)
    .eq("trigger", trigger)
    .maybeSingle();
  if (!data) return { enabled: true, templateBody: null };
  return {
    enabled: data.enabled !== false,
    templateBody: data.template_body ?? null,
  };
}

export function applyTemplate(
  template: string,
  vars: Record<string, string>,
) {
  let out = template;
  for (const [k, v] of Object.entries(vars)) {
    out = out.replaceAll(`{{${k}}}`, v);
  }
  return out;
}
