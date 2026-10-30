"use server";

import { revalidatePath } from "next/cache";
import { requireMembership } from "@/lib/auth/session";
import { findOrCreateContact } from "@/lib/crm/contacts";
import { normalizePhone } from "@/lib/utils";

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
  } = {
    stage_id: input.stageId,
    last_activity_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  if (stage.is_lost) patch.lost_reason = input.lostReason;
  if (stage.is_won && input.value != null) patch.value = input.value;

  const { error } = await supabase
    .from("leads")
    .update(patch)
    .eq("id", input.leadId)
    .eq("client_id", client.id);

  if (error) return { error: error.message };
  revalidatePath("/leads");
  return { ok: true };
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
