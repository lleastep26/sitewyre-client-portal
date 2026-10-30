import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { ClientRow, MembershipRole, MembershipRow } from "@/lib/supabase/types";

export async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, user };
}

export async function requireMembership(preferredClientId?: string) {
  const { supabase, user } = await requireUser();

  const { data: memberships } = await supabase
    .from("memberships")
    .select("*")
    .eq("user_id", user.id);

  const list = (memberships ?? []) as MembershipRow[];
  const isAdmin = list.some((m) => m.role === "sitewyre_admin");

  const membership =
    (preferredClientId
      ? list.find((m) => m.client_id === preferredClientId)
      : undefined) ??
    list.find((m) => m.role !== "sitewyre_admin") ??
    list[0];

  let client: ClientRow | null = null;
  let role: MembershipRole = "owner";

  if (membership) {
    role = membership.role;
    const { data } = await supabase
      .from("clients")
      .select("*")
      .eq("id", membership.client_id)
      .maybeSingle();
    client = data;
  } else {
    const { data } = await supabase
      .from("clients")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();
    client = data;
    role = "owner";
  }

  if (!client && isAdmin) {
    const { data } = await supabase.from("clients").select("*").limit(1).maybeSingle();
    client = data;
    role = "sitewyre_admin";
  }

  if (!client && !isAdmin) {
    redirect("/login?error=no_membership");
  }

  return {
    supabase,
    user,
    client,
    role,
    isAdmin,
    memberships: list,
  };
}
