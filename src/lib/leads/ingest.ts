import type { SupabaseClient } from "@supabase/supabase-js";
import type { ClientRow, Database } from "@/lib/supabase/types";
import { findOrCreateContact } from "@/lib/crm/contacts";
import { inngest } from "@/lib/inngest/client";
import { normalizePhone } from "@/lib/utils";

type Admin = SupabaseClient<Database>;

export type IngestLeadInput = {
  name: string;
  phone: string;
  email?: string | null;
  message: string;
  source: string;
  service?: string | null;
  smsOptIn?: boolean;
};

/**
 * Stores a new inbound lead and starts its workflow (instant reply,
 * follow-ups, owner alert) — the one path for website forms and the chat
 * widget, so both behave identically.
 */
export async function ingestLead(
  supabase: Admin,
  client: Pick<ClientRow, "id">,
  input: IngestLeadInput,
): Promise<{ leadId: string; contactId: string } | { error: string }> {
  const contact = await findOrCreateContact(supabase, {
    clientId: client.id,
    name: input.name,
    phone: input.phone,
    email: input.email || null,
    source: input.source,
    smsOptIn: input.smsOptIn ?? true,
  });

  const { data: newStage } = await supabase
    .from("pipeline_stages")
    .select("id")
    .eq("client_id", client.id)
    .eq("name", "New")
    .maybeSingle();

  const { data: lead, error } = await supabase
    .from("leads")
    .insert({
      client_id: client.id,
      contact_id: contact.id,
      stage_id: newStage?.id ?? null,
      name: input.name,
      phone: normalizePhone(input.phone) || input.phone,
      email: input.email || null,
      message: input.message,
      source: input.source,
      service: input.service ?? null,
      last_activity_at: new Date().toISOString(),
    })
    .select("*")
    .single();

  if (error || !lead) {
    console.error("Failed to store lead", error);
    return { error: "Unable to save lead" };
  }

  await supabase.from("activities").insert({
    client_id: client.id,
    contact_id: contact.id,
    type: "lead_created",
    payload: { lead_id: lead.id, source: lead.source, message: lead.message },
    occurred_at: new Date().toISOString(),
  });

  try {
    await inngest.send({
      name: "portal/lead.created",
      data: {
        clientId: client.id,
        leadId: lead.id,
        phone: lead.phone,
        email: lead.email,
        name: lead.name,
      },
    });
  } catch (err) {
    // Lead is already stored; automations can retry once INNGEST_EVENT_KEY is set.
    console.warn("Inngest lead.created not sent", err);
  }

  return { leadId: lead.id, contactId: contact.id };
}
