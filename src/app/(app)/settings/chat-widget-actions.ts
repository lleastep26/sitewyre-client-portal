"use server";

import { revalidatePath } from "next/cache";
import { requireMembership } from "@/lib/auth/session";
import { hasAnthropicKey } from "@/lib/integrations/anthropic";

export async function setChatWidgetEnabled(
  formData: FormData,
): Promise<{ ok: true } | { error: string }> {
  const { supabase, client, role } = await requireMembership();
  if (!client) return { error: "No business is linked to this account." };
  if (role !== "owner" && role !== "sitewyre_admin") {
    return { error: "Only the owner or a Sitewyre admin can change this." };
  }

  const enabled = formData.get("enabled") === "true";
  if (enabled && !hasAnthropicKey()) {
    return {
      error: "Couldn't turn on the chat widget: ANTHROPIC_API_KEY is missing — add it to Vercel first.",
    };
  }
  if (enabled && !client.site_key) {
    return { error: "This business has no site key yet, so the widget can't be installed." };
  }

  const { error } = await supabase
    .from("clients")
    .update({ chat_widget_enabled: enabled })
    .eq("id", client.id);
  if (error) return { error: error.message };

  revalidatePath("/settings");
  return { ok: true };
}
