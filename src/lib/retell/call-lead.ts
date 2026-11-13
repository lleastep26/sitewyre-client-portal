import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { normalizePhone } from "@/lib/utils";
import { inngest } from "@/lib/inngest/client";

type Admin = SupabaseClient<Database>;

/** An open lead that's had no activity for longer than this is treated as
 * a finished enquiry: a new call from the same number starts a new lead. */
export const CALL_LEAD_REUSE_DAYS = 30;

const OPEN_STATUSES = ["new", "contacted", "replied"];
const UNKNOWN_CALLER = "Unknown caller";

/** With no call start time to go by, a lead this recent counts as made
 * during the call. */
const THIS_CALL_FALLBACK_MS = 30 * 60_000;

export type CallLead = {
  id: string;
  name: string;
  phone: string;
  contact_id: string | null;
  stage_id: string | null;
  source: string | null;
  /** Created during this call, so the agent may still correct its name
   * and number. */
  fromThisCall: boolean;
};

/** Whether a row was created during the call that started at
 * `callStartedAt` (or, without one, in the last 30 minutes). */
export function isFromThisCall(createdAt: string, now: Date, callStartedAt: Date | null): boolean {
  const since = callStartedAt?.getTime() ?? now.getTime() - THIS_CALL_FALLBACK_MS;
  return Date.parse(createdAt) >= since;
}

type LeadActivity = {
  lifecycle_status: string;
  created_at: string;
  last_activity_at: string | null;
};

/**
 * Whether an existing lead is the one a phone call belongs to. It is when
 * the lead was created or touched during this call (the agent saved it,
 * or a booking just moved it to "booked"), or when it's still open and
 * has had activity in the last 30 days. An older lead is left alone, so
 * the call gets a new lead that shows up as new today.
 */
export function isLeadLiveForCall(
  lead: LeadActivity,
  now: Date,
  callStartedAt: Date | null,
): boolean {
  const lastTouch = Math.max(
    Date.parse(lead.created_at),
    lead.last_activity_at ? Date.parse(lead.last_activity_at) : 0,
  );
  if (callStartedAt && lastTouch >= callStartedAt.getTime()) return true;
  const cutoff = now.getTime() - CALL_LEAD_REUSE_DAYS * 86_400_000;
  return OPEN_STATUSES.includes(lead.lifecycle_status) && lastTouch >= cutoff;
}

/** The lead a call from `phone` belongs to, or null when the call should
 * start a new one. A lead matches on its phone number, or on the caller's
 * contact (the caller may have asked to be reached on another number).
 * The most recently created match wins. */
export async function findLeadForCall(
  supabase: Admin,
  clientId: string,
  phone: string,
  opts: { now?: Date; callStartedAt?: Date | null; contactId?: string | null } = {},
): Promise<CallLead | null> {
  const normalized = normalizePhone(phone);
  if (!normalized && !opts.contactId) return null;
  const { data } = await supabase
    .from("leads")
    .select("id, name, phone, contact_id, stage_id, source, lifecycle_status, created_at, last_activity_at")
    .eq("client_id", clientId)
    .order("created_at", { ascending: false })
    .limit(200);
  const now = opts.now ?? new Date();
  const callStartedAt = opts.callStartedAt ?? null;
  const match = (data ?? []).find(
    (l) =>
      ((!!normalized && normalizePhone(l.phone) === normalized) ||
        (!!opts.contactId && l.contact_id === opts.contactId)) &&
      isLeadLiveForCall(l, now, callStartedAt),
  );
  if (!match) return null;
  return {
    id: match.id,
    name: match.name,
    phone: match.phone,
    contact_id: match.contact_id,
    stage_id: match.stage_id,
    source: match.source,
    fromThisCall: isFromThisCall(match.created_at, now, callStartedAt),
  };
}

async function newStageId(supabase: Admin, clientId: string): Promise<string | null> {
  const { data } = await supabase
    .from("pipeline_stages")
    .select("id")
    .eq("client_id", clientId)
    .eq("name", "New")
    .maybeSingle();
  return data?.id ?? null;
}

/**
 * Records a call against an existing lead: bumps its activity, and fills
 * in anything that would keep it off the Leads page or out of the inbox
 * thread (no pipeline stage, no linked contact, no source). A lead made
 * during this call also takes a corrected name or number from the agent.
 */
export async function touchCallLead(
  supabase: Admin,
  clientId: string,
  lead: CallLead,
  opts: { contactId: string | null; name?: string; phone?: string; message?: string },
): Promise<void> {
  const patch: Database["public"]["Tables"]["leads"]["Update"] = {
    last_activity_at: new Date().toISOString(),
  };
  if (opts.message) patch.message = opts.message;
  if (!lead.contact_id && opts.contactId) patch.contact_id = opts.contactId;
  if (!lead.source) patch.source = "ai_receptionist";
  if (opts.name && opts.name !== lead.name && (lead.fromThisCall || lead.name === UNKNOWN_CALLER)) {
    patch.name = opts.name;
  }
  if (opts.phone && lead.fromThisCall && normalizePhone(lead.phone) !== normalizePhone(opts.phone)) {
    patch.phone = opts.phone;
  }
  if (!lead.stage_id) {
    const stageId = await newStageId(supabase, clientId);
    if (stageId) patch.stage_id = stageId;
  }
  await supabase.from("leads").update(patch).eq("id", lead.id);
}

/**
 * Creates the lead for an AI-handled call in the "New" stage and starts
 * the normal new-lead workflow. The owner's "New lead" alert is skipped:
 * they get one text per call, after it ends.
 */
export async function createCallLead(
  supabase: Admin,
  opts: {
    client: { id: string; user_id: string | null };
    contactId: string | null;
    name: string | null;
    phone: string;
    message: string;
  },
): Promise<{ lead: { id: string; name: string; contact_id: string | null } | null; error: string | null }> {
  const name = opts.name?.trim() || UNKNOWN_CALLER;
  const { data: lead, error } = await supabase
    .from("leads")
    .insert({
      client_id: opts.client.id,
      contact_id: opts.contactId,
      stage_id: await newStageId(supabase, opts.client.id),
      name,
      phone: opts.phone || "unknown",
      message: opts.message,
      source: "ai_receptionist",
      owner_id: opts.client.user_id,
      last_activity_at: new Date().toISOString(),
    })
    .select("id, name, contact_id")
    .single();
  if (error || !lead) return { lead: null, error: error?.message ?? "Could not save the lead." };

  await inngest
    .send({
      name: "portal/lead.created",
      data: {
        clientId: opts.client.id,
        leadId: lead.id,
        phone: opts.phone,
        name,
        skipOwnerAlert: true,
      },
    })
    .catch(() => undefined);

  return { lead, error: null };
}
