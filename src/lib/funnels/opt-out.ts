import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { normalizePhone } from "@/lib/utils";

export type SmsBlockReason = "opted_out" | "no_sms_consent";

/**
 * Why a customer must not be texted, or null when they can be.
 *
 * - "opted_out": the number has a row in `opt_outs` (a real STOP reply, or
 *   a CSV import skip).
 * - "no_sms_consent": the contact's `sms_opt_in` is false with no STOP on
 *   file. That's a lead who came in without agreeing to texts: one who
 *   declined on a form, or one captured from a client's own website form
 *   before the client confirmed their consent wording is shown.
 *
 * `sms_opt_in` is `not null default true`, so a default or missing value
 * never blocks. The contact is looked up by `contactId` when the caller
 * has it and by phone number otherwise, so every text path honours the
 * flag whether or not it knows the contact.
 *
 * Normalizes `phone` itself (idempotent on an already-normalized number) so
 * every opt_outs read/write goes through the same normalization regardless
 * of what the caller passed in.
 */
export async function smsBlockReason(
  supabase: SupabaseClient<Database>,
  clientId: string,
  phone: string,
  contactId?: string | null,
): Promise<SmsBlockReason | null> {
  const normalized = normalizePhone(phone);
  const { data: optOut } = await supabase
    .from("opt_outs")
    .select("phone")
    .eq("client_id", clientId)
    .eq("phone", normalized)
    .maybeSingle();
  if (optOut) return "opted_out";

  if (contactId) {
    const { data: contact } = await supabase
      .from("contacts")
      .select("sms_opt_in")
      .eq("id", contactId)
      .maybeSingle();
    if (contact?.sms_opt_in === false) return "no_sms_consent";
  }

  // Also by number: the caller may not know the contact, or the same
  // number may sit on another contact record that has no consent.
  if (normalized) {
    const { data: withoutConsent } = await supabase
      .from("contacts")
      .select("sms_opt_in")
      .eq("client_id", clientId)
      .eq("sms_opt_in", false)
      .contains("phones", [normalized])
      .limit(1)
      .maybeSingle();
    if (withoutConsent?.sms_opt_in === false) return "no_sms_consent";
  }

  return null;
}

/** True when the customer must not be texted, for either reason above. */
export async function isOptedOut(
  supabase: SupabaseClient<Database>,
  clientId: string,
  phone: string,
  contactId?: string | null,
): Promise<boolean> {
  return (await smsBlockReason(supabase, clientId, phone, contactId)) !== null;
}

/** Record a real opt-out (e.g. an inbound STOP reply). Idempotent. */
export async function addOptOut(
  supabase: SupabaseClient<Database>,
  clientId: string,
  phone: string,
) {
  await supabase
    .from("opt_outs")
    .upsert(
      { client_id: clientId, phone: normalizePhone(phone) },
      { onConflict: "client_id,phone", ignoreDuplicates: true },
    );
}

/** Reverse an opt-out (e.g. an inbound START/UNSTOP reply). */
export async function removeOptOut(
  supabase: SupabaseClient<Database>,
  clientId: string,
  phone: string,
) {
  await supabase
    .from("opt_outs")
    .delete()
    .eq("client_id", clientId)
    .eq("phone", normalizePhone(phone));
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
