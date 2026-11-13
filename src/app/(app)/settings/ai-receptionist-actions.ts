"use server";

import { revalidatePath } from "next/cache";
import { requireMembership } from "@/lib/auth/session";
import { syncRetellAgent } from "@/lib/retell/agent-sync";

function canEdit(role: string): boolean {
  return role === "owner" || role === "sitewyre_admin";
}

export async function setAiReceptionistEnabled(
  formData: FormData,
): Promise<{ ok: true } | { error: string }> {
  const { supabase, client, role } = await requireMembership();
  if (!client) return { error: "No business is linked to this account." };
  if (!canEdit(role)) {
    return { error: "Only the owner or a Sitewyre admin can change this." };
  }

  const enabled = formData.get("enabled") === "true";

  if (enabled) {
    try {
      const result = await syncRetellAgent(supabase, client.id);
      if ("error" in result) return { error: result.error };
    } catch (e) {
      return {
        error: `Couldn't set up the AI receptionist: ${e instanceof Error ? e.message : "unknown error"}`,
      };
    }
  }

  const { error } = await supabase
    .from("clients")
    .update({ ai_receptionist_enabled: enabled })
    .eq("id", client.id);
  if (error) return { error: error.message };

  revalidatePath("/settings");
  return { ok: true };
}

export async function setAiReceptionistBookingEnabled(
  formData: FormData,
): Promise<{ ok: true } | { error: string }> {
  const { supabase, client, role } = await requireMembership();
  if (!client) return { error: "No business is linked to this account." };
  if (!canEdit(role)) {
    return { error: "Only the owner or a Sitewyre admin can change this." };
  }

  const bookingEnabled = formData.get("bookingEnabled") === "true";
  const { error } = await supabase
    .from("clients")
    .update({ ai_receptionist_booking_enabled: bookingEnabled })
    .eq("id", client.id);
  if (error) return { error: error.message };

  revalidatePath("/settings");
  return { ok: true };
}

/** Admin-only, deliberately not owner — same reasoning as
 * setSmsMonthlyAllowance: the allowance is set by Sitewyre, the client
 * only ever sees usage against it. */
export async function setRetellMinutesAllowance(
  formData: FormData,
): Promise<{ ok: true } | { error: string }> {
  const { supabase, client, role } = await requireMembership();
  if (!client) return { error: "No business is linked to this account." };
  if (role !== "sitewyre_admin") {
    return { error: "Only a Sitewyre admin can change the monthly allowance." };
  }

  const allowance = Number(formData.get("retellMinutesAllowance") ?? "");
  if (!Number.isFinite(allowance) || allowance < 0 || allowance > 100_000) {
    return { error: "Allowance must be a number, 0-100,000" };
  }

  const { error } = await supabase
    .from("clients")
    .update({ retell_minutes_allowance: allowance })
    .eq("id", client.id);
  if (error) return { error: error.message };

  revalidatePath("/settings");
  return { ok: true };
}
