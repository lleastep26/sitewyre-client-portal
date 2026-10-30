import { supabase } from "./supabase";

export type PortalRole = "owner" | "office" | "crew" | "sitewyre_admin";

export type MembershipInfo = {
  clientId: string;
  role: PortalRole;
  businessName: string | null;
};

export function isOwnerLike(role: PortalRole): boolean {
  return role === "owner" || role === "office" || role === "sitewyre_admin";
}

export async function loadMembership(
  userId: string,
): Promise<MembershipInfo | null> {
  if (!supabase) return null;

  const { data: membership } = await supabase
    .from("memberships")
    .select("client_id, role")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!membership?.client_id) return null;

  const { data: client } = await supabase
    .from("clients")
    .select("business_name")
    .eq("id", membership.client_id)
    .maybeSingle();

  return {
    clientId: membership.client_id as string,
    role: (membership.role as PortalRole) ?? "crew",
    businessName: (client?.business_name as string | null) ?? null,
  };
}
