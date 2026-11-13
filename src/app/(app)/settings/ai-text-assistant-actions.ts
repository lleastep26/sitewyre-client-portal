"use server";

import { revalidatePath } from "next/cache";
import { requireMembership } from "@/lib/auth/session";
import { hasAnthropicKey } from "@/lib/integrations/anthropic";

function canEdit(role: string): boolean {
  return role === "owner" || role === "sitewyre_admin";
}

export async function setAiTextAssistantEnabled(
  formData: FormData,
): Promise<{ ok: true } | { error: string }> {
  const { supabase, client, role } = await requireMembership();
  if (!client) return { error: "No business is linked to this account." };
  if (!canEdit(role)) {
    return { error: "Only the owner or a Sitewyre admin can change this." };
  }

  const enabled = formData.get("enabled") === "true";
  if (enabled && !hasAnthropicKey()) {
    return {
      error: "Couldn't turn on the AI text assistant: ANTHROPIC_API_KEY is missing — add it to Vercel first.",
    };
  }

  const { error } = await supabase
    .from("clients")
    .update({ ai_text_assistant_enabled: enabled })
    .eq("id", client.id);
  if (error) return { error: error.message };

  revalidatePath("/settings");
  revalidatePath("/inbox");
  return { ok: true };
}

/** Admin-only, deliberately not owner — same reasoning as
 * setSmsMonthlyAllowance: the allowance is set by Sitewyre, the client
 * only ever sees usage against it. */
export async function setAiTextRepliesAllowance(
  formData: FormData,
): Promise<{ ok: true } | { error: string }> {
  const { supabase, client, role } = await requireMembership();
  if (!client) return { error: "No business is linked to this account." };
  if (role !== "sitewyre_admin") {
    return { error: "Only a Sitewyre admin can change the monthly allowance." };
  }

  const allowance = Number(formData.get("aiTextRepliesAllowance") ?? "");
  if (!Number.isInteger(allowance) || allowance < 0 || allowance > 100_000) {
    return { error: "Allowance must be a whole number, 0-100,000" };
  }

  const { error } = await supabase
    .from("clients")
    .update({ ai_text_replies_allowance: allowance })
    .eq("id", client.id);
  if (error) return { error: error.message };

  revalidatePath("/settings");
  return { ok: true };
}
