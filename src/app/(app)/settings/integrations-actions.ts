"use server";

import { revalidatePath } from "next/cache";
import { requireMembership } from "@/lib/auth/session";
import { isAdProviderId } from "@/lib/integrations/ads";

// Owner and Sitewyre admins only. An agency admin's view-as session
// resolves to role "owner" (see src/lib/auth/session.ts), so this covers
// them too — the same rule the database policy enforces.
function canEdit(role: string): boolean {
  return role === "owner" || role === "sitewyre_admin";
}

/** Records that this business wants a platform connected. No external
 * call is made — it's a request the admin sees on /admin. */
export async function requestIntegration(
  formData: FormData,
): Promise<{ ok: true } | { error: string }> {
  const { supabase, client, role, user } = await requireMembership();
  if (!client) return { error: "No business is linked to this account." };
  if (!canEdit(role)) {
    return { error: "Only the owner or an admin can request a connection." };
  }
  const provider = String(formData.get("provider") ?? "");
  if (!isAdProviderId(provider)) return { error: "Unknown integration." };

  const { data: existing } = await supabase
    .from("integrations")
    .select("status")
    .eq("client_id", client.id)
    .eq("provider", provider)
    .maybeSingle();
  if (existing?.status === "connected" || existing?.status === "requested") return { ok: true };

  const { error } = await supabase.from("integrations").upsert(
    {
      client_id: client.id,
      provider,
      status: "requested",
      requested_at: new Date().toISOString(),
      requested_by_user_id: user.id,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "client_id,provider" },
  );
  if (error) return { error: error.message };

  revalidatePath("/settings");
  revalidatePath("/admin");
  return { ok: true };
}

export async function cancelIntegrationRequest(
  formData: FormData,
): Promise<{ ok: true } | { error: string }> {
  const { supabase, client, role } = await requireMembership();
  if (!client) return { error: "No business is linked to this account." };
  if (!canEdit(role)) {
    return { error: "Only the owner or an admin can change this." };
  }
  const provider = String(formData.get("provider") ?? "");
  if (!isAdProviderId(provider)) return { error: "Unknown integration." };

  // Only ever undoes a pending request — never touches a live connection.
  const { error } = await supabase
    .from("integrations")
    .update({ status: "disconnected", requested_at: null, updated_at: new Date().toISOString() })
    .eq("client_id", client.id)
    .eq("provider", provider)
    .eq("status", "requested");
  if (error) return { error: error.message };

  revalidatePath("/settings");
  revalidatePath("/admin");
  return { ok: true };
}
