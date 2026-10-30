"use server";

import { revalidatePath } from "next/cache";
import { requireMembership } from "@/lib/auth/session";
import { AUTOMATION_DEFS } from "@/lib/automations";

export async function setAutomationEnabled(input: {
  trigger: string;
  enabled: boolean;
}) {
  const { supabase, client } = await requireMembership();
  if (!client) return { error: "No client" };
  const known = AUTOMATION_DEFS.some((d) => d.key === input.trigger);
  if (!known) return { error: "Unknown automation" };

  const { data: existing } = await supabase
    .from("client_automations")
    .select("trigger")
    .eq("client_id", client.id)
    .eq("trigger", input.trigger)
    .maybeSingle();

  const { error } = existing
    ? await supabase
        .from("client_automations")
        .update({
          enabled: input.enabled,
          updated_at: new Date().toISOString(),
        })
        .eq("client_id", client.id)
        .eq("trigger", input.trigger)
    : await supabase.from("client_automations").insert({
        client_id: client.id,
        trigger: input.trigger,
        enabled: input.enabled,
      });
  if (error) return { error: error.message };
  revalidatePath("/automations");
  return { ok: true };
}

export async function setAutomationTemplate(formData: FormData) {
  const { supabase, client } = await requireMembership();
  if (!client) return { error: "No client" };
  const trigger = String(formData.get("trigger") ?? "");
  const templateBody = String(formData.get("template_body") ?? "").trim() || null;
  const known = AUTOMATION_DEFS.some((d) => d.key === trigger);
  if (!known) return { error: "Unknown automation" };

  const { data: existing } = await supabase
    .from("client_automations")
    .select("trigger")
    .eq("client_id", client.id)
    .eq("trigger", trigger)
    .maybeSingle();

  const { error } = existing
    ? await supabase
        .from("client_automations")
        .update({
          template_body: templateBody,
          updated_at: new Date().toISOString(),
        })
        .eq("client_id", client.id)
        .eq("trigger", trigger)
    : await supabase.from("client_automations").insert({
        client_id: client.id,
        trigger,
        enabled: true,
        template_body: templateBody,
      });
  if (error) return { error: error.message };
  revalidatePath("/automations");
  return { ok: true };
}
