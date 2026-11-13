import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { getAppUrl } from "@/lib/supabase/env";
import { buildRetellBeginMessage, buildRetellGeneralPrompt } from "@/lib/business-knowledge/summary";
import {
  createRetellAgent,
  updateRetellAgentPrompt,
  type RetellFunctionUrls,
} from "@/lib/integrations/retell";

type Admin = SupabaseClient<Database>;

function functionUrls(): RetellFunctionUrls {
  const base = getAppUrl();
  return {
    checkAvailability: `${base}/api/retell/functions/check-availability`,
    bookAppointment: `${base}/api/retell/functions/book-appointment`,
    upsertLead: `${base}/api/retell/functions/upsert-lead`,
    flagEmergency: `${base}/api/retell/functions/flag-emergency`,
  };
}

async function loadKnowledgeInput(supabase: Admin, clientId: string) {
  const [{ data: client }, { data: services }, { data: availability }, { data: faqs }] =
    await Promise.all([
      supabase
        .from("clients")
        .select(
          "business_name, trade, service_area, services_offered, after_hours_rules, ai_never_say, retell_llm_id, retell_agent_id",
        )
        .eq("id", clientId)
        .single(),
      supabase
        .from("services")
        .select("name, duration_minutes")
        .eq("client_id", clientId)
        .eq("bookable_online", true),
      supabase
        .from("availability")
        .select("weekday, start_time, end_time")
        .eq("client_id", clientId),
      supabase
        .from("client_faqs")
        .select("question, answer")
        .eq("client_id", clientId)
        .order("position", { ascending: true }),
    ]);
  return {
    client,
    services: services ?? [],
    availability: availability ?? [],
    faqs: faqs ?? [],
  };
}

/**
 * Creates the client's Retell agent if it doesn't have one yet, otherwise
 * pushes a refreshed prompt to the existing one. Called directly by the
 * explicit "turn on AI receptionist" settings action (creation path), and
 * via pushBusinessKnowledgeToRetell below after any knowledge edit (update
 * path only — editing knowledge never creates an agent on its own).
 */
export async function syncRetellAgent(
  supabase: Admin,
  clientId: string,
): Promise<{ ok: true } | { error: string }> {
  const { client, services, availability, faqs } = await loadKnowledgeInput(supabase, clientId);
  if (!client) return { error: "Client not found." };

  const generalPrompt = buildRetellGeneralPrompt({
    client,
    bookableServices: services,
    availability,
    faqs,
  });
  const beginMessage = buildRetellBeginMessage(client.business_name);

  if (client.retell_llm_id) {
    await updateRetellAgentPrompt(client.retell_llm_id, generalPrompt, beginMessage);
    return { ok: true };
  }

  const { llmId, agentId } = await createRetellAgent({
    generalPrompt,
    beginMessage,
    functionUrls: functionUrls(),
    agentName: client.business_name ?? "AI receptionist",
    webhookUrl: `${getAppUrl()}/api/retell/webhook`,
  });

  const { error } = await supabase
    .from("clients")
    .update({ retell_llm_id: llmId, retell_agent_id: agentId })
    .eq("id", clientId);
  if (error) return { error: error.message };
  return { ok: true };
}

/**
 * Best-effort refresh after a Business Knowledge edit — no-ops if this
 * client has never enabled the AI receptionist (never creates an agent as
 * a side effect of editing FAQs). Swallows errors; never blocks the save.
 */
export async function pushBusinessKnowledgeToRetell(
  supabase: Admin,
  clientId: string,
): Promise<void> {
  try {
    const { data: client } = await supabase
      .from("clients")
      .select("retell_llm_id")
      .eq("id", clientId)
      .maybeSingle();
    if (!client?.retell_llm_id) return;
    await syncRetellAgent(supabase, clientId);
  } catch {
    // best-effort — a knowledge edit must never fail because Retell is down.
  }
}
