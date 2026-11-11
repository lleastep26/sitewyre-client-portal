import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { ClientRow, MembershipRole, MembershipRow } from "@/lib/supabase/types";

/** Which client a sitewyre_admin is currently "viewing as". Read-only for
 * everyone except the admin switcher action — never trusted without
 * re-verifying both admin status and the client's existence server-side. */
export const ADMIN_VIEW_COOKIE = "admin_view_client_id";

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
  // Recomputed fresh from the DB on every call — never cached — so a role
  // change (promotion or demotion) takes effect on the very next request.
  const isAdmin = list.some((m) => m.role === "sitewyre_admin");

  // No `?? list[0]` fallback here: a sitewyre_admin's own membership row
  // must never be used as "their" client — that row only exists to satisfy
  // memberships.client_id's NOT NULL constraint. Falling back to it would
  // permanently bind every admin session to whichever client that row
  // happens to point at, bypassing the cookie-based admin switcher below.
  const membership =
    (preferredClientId
      ? list.find((m) => m.client_id === preferredClientId)
      : undefined) ??
    list.find((m) => m.role !== "sitewyre_admin");

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

  // The admin_view_client_id cookie is read ONLY inside this isAdmin branch.
  // A non-admin's cookie (stale, forged, or left over from a past admin
  // role) is never consulted — isAdmin above is freshly derived, not cached.
  if (!client && isAdmin) {
    const cookieStore = await cookies();
    const cookieValue = cookieStore.get(ADMIN_VIEW_COOKIE)?.value;
    const candidateId = preferredClientId ?? cookieValue;

    if (candidateId) {
      const { data } = await supabase
        .from("clients")
        .select("*")
        .eq("id", candidateId)
        .maybeSingle();

      if (data) {
        client = data;
        role = "sitewyre_admin";
      } else if (cookieValue && cookieValue === candidateId) {
        // Cookie points at a client that no longer exists. Route Handlers
        // (unlike Server Components) are allowed to mutate cookies, so
        // clearing it happens there, then back to /admin to pick again.
        redirect("/admin/clear-invalid-client");
      }
    }

    if (!client) {
      // No cookie, or an explicit preferredClientId that didn't resolve:
      // send the admin to the switcher instead of guessing a client.
      redirect("/admin");
    }
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

/**
 * Admin-only check with no client resolution. Use this for /admin itself
 * (and its actions) instead of requireMembership — requireMembership can
 * redirect an admin to /admin, so if /admin also called requireMembership
 * it would risk a redirect loop. This never reads or depends on the
 * admin_view_client_id cookie.
 */
export async function requireAdmin() {
  const { supabase, user } = await requireUser();

  const { data: memberships } = await supabase
    .from("memberships")
    .select("*")
    .eq("user_id", user.id);

  const isAdmin = ((memberships ?? []) as MembershipRow[]).some(
    (m) => m.role === "sitewyre_admin",
  );
  if (!isAdmin) redirect("/");

  return { supabase, user };
}
