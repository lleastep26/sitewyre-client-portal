"use server";

import { revalidatePath } from "next/cache";
import { requireMembership } from "@/lib/auth/session";

function canEdit(role: string): boolean {
  return role === "owner" || role === "sitewyre_admin";
}

export async function disconnectCalendar(): Promise<{ ok: true } | { error: string }> {
  const { supabase, client, role } = await requireMembership();
  if (!client) return { error: "No business is linked to this account." };
  if (!canEdit(role)) {
    return { error: "Only the owner or a Sitewyre admin can edit this." };
  }

  const { error } = await supabase
    .from("calendar_connections")
    .delete()
    .eq("client_id", client.id);
  if (error) return { error: error.message };

  revalidatePath("/settings");
  return { ok: true };
}
