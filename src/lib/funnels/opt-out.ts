import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

/**
 * A phone is opted out only on a genuine signal: a row in `opt_outs` (a real
 * STOP reply, or a CSV import skip) or a contact whose `sms_opt_in` is
 * explicitly false. `sms_opt_in` is `not null default true` in the schema
 * and every write path defaults it true — it is only ever set false by a
 * real STOP reply (src/app/api/twilio/webhook/route.ts) or a lead choosing
 * to opt out on the public form, so treating `false` as "opted out" here
 * is safe and never catches a default or a null.
 */
export async function isOptedOut(
  supabase: SupabaseClient<Database>,
  clientId: string,
  phone: string,
  contactId?: string | null,
): Promise<boolean> {
  const { data: optOut } = await supabase
    .from("opt_outs")
    .select("phone")
    .eq("client_id", clientId)
    .eq("phone", phone)
    .maybeSingle();
  if (optOut) return true;

  if (contactId) {
    const { data: contact } = await supabase
      .from("contacts")
      .select("sms_opt_in")
      .eq("id", contactId)
      .maybeSingle();
    if (contact?.sms_opt_in === false) return true;
  }

  return false;
}

export async function logSkippedOptOut(
  supabase: SupabaseClient<Database>,
  params: { clientId: string; trigger: string; log?: Record<string, unknown> },
) {
  await supabase.from("workflow_runs").insert({
    client_id: params.clientId,
    trigger: params.trigger,
    status: "skipped",
    log: { reason: "opted_out", ...params.log },
  });
}
