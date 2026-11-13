"use server";

import { revalidatePath } from "next/cache";
import { requireMembership } from "@/lib/auth/session";
import { findOrCreateContact } from "@/lib/crm/contacts";
import { normalizePhone } from "@/lib/utils";
import { OPEN_LEAD_STATUSES, type LeadLifecycleStatus } from "@/lib/leads/lifecycle";
import { isOptedOut } from "@/lib/funnels/opt-out";
import { planBlastSchedule } from "@/lib/funnels/blast-schedule";
import { resolveSmsFrom } from "@/lib/a2p/sending";
import { inngest } from "@/lib/inngest/client";

const REACTIVATION_MIN_AGE_DAYS = 30;
const REACTIVATION_COOLDOWN_DAYS = 90;

export async function moveLead(input: {
  leadId: string;
  stageId: string;
  lostReason?: string;
  value?: number;
}) {
  const { supabase, client } = await requireMembership();
  if (!client) return { error: "No client" };

  const { data: stage } = await supabase
    .from("pipeline_stages")
    .select("*")
    .eq("id", input.stageId)
    .eq("client_id", client.id)
    .single();

  if (!stage) return { error: "Invalid stage" };
  if (stage.is_lost && !input.lostReason) {
    return { error: "Lost reason required" };
  }

  const patch: {
    stage_id: string;
    last_activity_at: string;
    updated_at: string;
    lost_reason?: string;
    value?: number;
    lifecycle_status?: LeadLifecycleStatus;
  } = {
    stage_id: input.stageId,
    last_activity_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  if (stage.is_lost) {
    patch.lost_reason = input.lostReason;
    patch.lifecycle_status = "lost";
  }
  if (stage.is_won) {
    if (input.value != null) patch.value = input.value;
    patch.lifecycle_status = "booked";
  }

  const { error } = await supabase
    .from("leads")
    .update(patch)
    .eq("id", input.leadId)
    .eq("client_id", client.id);

  if (error) return { error: error.message };
  revalidatePath("/leads");
  return { ok: true };
}

export async function createLeadAction(formData: FormData): Promise<void> {
  await createLead(formData);
}

export async function createLead(formData: FormData) {
  const { supabase, client, user } = await requireMembership();
  if (!client) return { error: "No client" };

  const name = String(formData.get("name") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const message = String(formData.get("message") ?? "Manual lead").trim();
  const email = String(formData.get("email") ?? "").trim() || null;
  if (!name || !phone) return { error: "Name and phone required" };

  const contact = await findOrCreateContact(supabase, {
    clientId: client.id,
    name,
    phone,
    email,
    source: "manual",
  });

  const { data: stage } = await supabase
    .from("pipeline_stages")
    .select("id")
    .eq("client_id", client.id)
    .eq("name", "New")
    .maybeSingle();

  const { error } = await supabase.from("leads").insert({
    client_id: client.id,
    contact_id: contact.id,
    stage_id: stage?.id ?? null,
    name,
    phone: normalizePhone(phone) || phone,
    email,
    message,
    source: "manual",
    owner_id: user.id,
    last_activity_at: new Date().toISOString(),
  });

  if (error) return { error: error.message };
  revalidatePath("/leads");
  revalidatePath("/");
  return { ok: true };
}

/**
 * One-click reactivation campaign: leads that are still open (never
 * booked, not marked lost/no-show), older than 30 days, and not texted
 * in the last 90 days — paced with the same 40/day cap as the review
 * blast so this never floods a client's A2P throughput.
 */
export async function reactivateOldLeads(): Promise<
  { ok: true; scheduled: number; skipped: number } | { error: string }
> {
  const { supabase, client } = await requireMembership();
  if (!client) return { error: "No client" };
  if (!client.twilio_phone_number) return { error: "No Twilio number is assigned yet." };

  const from = resolveSmsFrom(client);
  if (!from) return { error: "No sending number is configured for this client." };

  const minAgeCutoff = new Date(
    Date.now() - REACTIVATION_MIN_AGE_DAYS * 86_400_000,
  ).toISOString();
  const cooldownCutoff = new Date(
    Date.now() - REACTIVATION_COOLDOWN_DAYS * 86_400_000,
  ).toISOString();

  const { data: candidates } = await supabase
    .from("leads")
    .select("id, name, phone, last_texted_at")
    .eq("client_id", client.id)
    .in("lifecycle_status", OPEN_LEAD_STATUSES)
    .lt("created_at", minAgeCutoff)
    .or(`last_texted_at.is.null,last_texted_at.lt.${cooldownCutoff}`);

  const rows: { id: string; name: string; phone: string }[] = [];
  let skipped = 0;
  for (const lead of candidates ?? []) {
    if (await isOptedOut(supabase, client.id, lead.phone)) {
      skipped += 1;
      continue;
    }
    rows.push({ id: lead.id, name: lead.name, phone: normalizePhone(lead.phone) || lead.phone });
  }

  if (!rows.length) return { ok: true, scheduled: 0, skipped };

  const scheduled = planBlastSchedule(rows, {
    timeZone: client.timezone ?? "America/Chicago",
  });

  for (const row of scheduled) {
    await inngest
      .send({
        name: "portal/lead_reactivation.contact_started",
        data: {
          clientId: client.id,
          leadId: row.id,
          phone: row.phone,
          from,
          firstName: row.name.split(" ")[0] ?? row.name,
          businessName: client.business_name ?? "us",
          sendAt: row.firstSendAt.toISOString(),
        },
      })
      .catch(() => undefined);
  }

  revalidatePath("/leads");
  return { ok: true, scheduled: scheduled.length, skipped };
}
