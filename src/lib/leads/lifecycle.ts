import type { SupabaseClient } from "@supabase/supabase-js";
import type { ClientRow, Database } from "@/lib/supabase/types";
import { normalizePhone } from "@/lib/utils";

type Admin = SupabaseClient<Database>;

/** Statuses where the lead is still an active, unresolved opportunity —
 * used to find "the open lead" for a phone number or contact, and to
 * gate follow-up/reactivation sends (never text a lead that's already
 * moved past these). */
export const OPEN_LEAD_STATUSES = ["new", "contacted", "replied"] as const;

export type LeadLifecycleStatus =
  | "new"
  | "contacted"
  | "replied"
  | "booked"
  | "no_show"
  | "lost";

export function isOpenLeadStatus(status: LeadLifecycleStatus): boolean {
  return (OPEN_LEAD_STATUSES as readonly string[]).includes(status);
}

/**
 * True if `phone` is the business's own alert/forwarding number, not a
 * customer's — an inbound text from the owner's phone (e.g. replying to
 * their own lead-alert SMS) must never be mistaken for the lead replying.
 */
export function isOwnerPhone(
  client: Pick<ClientRow, "phone" | "forward_to_phone">,
  phone: string,
): boolean {
  const normalized = normalizePhone(phone);
  if (!normalized) return false;
  return (
    (!!client.phone && normalizePhone(client.phone) === normalized) ||
    (!!client.forward_to_phone && normalizePhone(client.forward_to_phone) === normalized)
  );
}

/** The most recently created open lead for this client+phone, or null.
 * When a number matches several leads, the most recent open one wins. */
export async function findOpenLeadForPhone(
  supabase: Admin,
  clientId: string,
  phone: string,
): Promise<{ id: string; name: string; contact_id: string | null } | null> {
  const normalized = normalizePhone(phone);
  if (!normalized) return null;

  const { data } = await supabase
    .from("leads")
    .select("id, name, contact_id, phone, lifecycle_status")
    .eq("client_id", clientId)
    .in("lifecycle_status", OPEN_LEAD_STATUSES)
    .order("created_at", { ascending: false });

  const match = (data ?? []).find((l) => normalizePhone(l.phone) === normalized);
  return match ? { id: match.id, name: match.name, contact_id: match.contact_id } : null;
}

/** The most recent open lead for this client+contact, or null — used when
 * a booking is made against a known contact rather than a raw phone. */
export async function findOpenLeadForContact(
  supabase: Admin,
  clientId: string,
  contactId: string,
): Promise<{ id: string } | null> {
  const { data } = await supabase
    .from("leads")
    .select("id")
    .eq("client_id", clientId)
    .eq("contact_id", contactId)
    .in("lifecycle_status", OPEN_LEAD_STATUSES)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}

export async function setLeadLifecycleStatus(
  supabase: Admin,
  leadId: string,
  status: LeadLifecycleStatus,
): Promise<void> {
  await supabase
    .from("leads")
    .update({ lifecycle_status: status, last_activity_at: new Date().toISOString() })
    .eq("id", leadId);
}

export async function recordLeadTexted(supabase: Admin, leadId: string): Promise<void> {
  await supabase
    .from("leads")
    .update({ last_texted_at: new Date().toISOString() })
    .eq("id", leadId);
}

/**
 * Call whenever an appointment is created for a contact — cancels that
 * contact's open lead's follow-up drip (via the portal/lead.booked event)
 * and marks it booked. No-ops if the contact has no open lead (e.g. an
 * organic booking with no prior lead record).
 */
export async function handleLeadBookedForContact(
  supabase: Admin,
  opts: { clientId: string; contactId: string | null; appointmentId: string },
  sendEvent: (event: {
    name: "portal/lead.booked";
    data: { clientId: string; leadId: string; appointmentId: string };
  }) => Promise<unknown>,
): Promise<void> {
  if (!opts.contactId) return;
  const lead = await findOpenLeadForContact(supabase, opts.clientId, opts.contactId);
  if (!lead) return;
  await setLeadLifecycleStatus(supabase, lead.id, "booked");
  await sendEvent({
    name: "portal/lead.booked",
    data: { clientId: opts.clientId, leadId: lead.id, appointmentId: opts.appointmentId },
  }).catch(() => undefined);
}
