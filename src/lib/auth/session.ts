import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { ClientRow, MembershipRole, MembershipRow } from "@/lib/supabase/types";

/** Which client a sitewyre_admin or agency_admin is currently "viewing
 * as". Read-only for everyone except the admin switcher action — never
 * trusted without re-verifying admin/agency status and the client's
 * existence (and, for an agency_admin, agency ownership) server-side. */
export const ADMIN_VIEW_COOKIE = "admin_view_client_id";

export async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, user };
}

/** The agency_id a user administers, or null if they aren't an
 * agency_admin. A user can only belong to one agency today. */
async function getAgencyAdminAgencyId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("agency_memberships")
    .select("agency_id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();
  return data?.agency_id ?? null;
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
  const isSitewyreAdmin = list.some((m) => m.role === "sitewyre_admin");
  const agencyId = isSitewyreAdmin
    ? null
    : await getAgencyAdminAgencyId(supabase, user.id);
  const isAgencyAdmin = Boolean(agencyId);
  const canViewAs = isSitewyreAdmin || isAgencyAdmin;

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
  let viewingAs = false;

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

  // The admin_view_client_id cookie is read ONLY inside this branch, for a
  // sitewyre_admin or agency_admin. A regular member's cookie (stale,
  // forged, or left over from a past admin/agency_admin role) is never
  // consulted — canViewAs above is freshly derived, not cached.
  if (!client && canViewAs) {
    const cookieStore = await cookies();
    const cookieValue = cookieStore.get(ADMIN_VIEW_COOKIE)?.value;
    const candidateId = preferredClientId ?? cookieValue;

    if (candidateId) {
      const { data } = await supabase
        .from("clients")
        .select("*")
        .eq("id", candidateId)
        .maybeSingle();

      // An agency_admin may only view-as a client in their own agency —
      // anything else is treated exactly like a stale/invalid cookie.
      const allowed = data && (isSitewyreAdmin || data.agency_id === agencyId);

      if (allowed) {
        client = data;
        // An agency_admin gets owner-level access to their own
        // sub-accounts; sitewyre_admin keeps its own distinct role so
        // platform-only checks (role === "sitewyre_admin") stay exactly
        // that — never satisfied by an agency_admin's view-as session.
        role = isSitewyreAdmin ? "sitewyre_admin" : "owner";
        viewingAs = true;
      } else if (cookieValue && cookieValue === candidateId) {
        // Cookie points at a client that no longer exists, or (for an
        // agency_admin) one outside their agency. Route Handlers (unlike
        // Server Components) are allowed to mutate cookies, so clearing
        // it happens there, then back to /admin to pick again.
        redirect("/admin/clear-invalid-client");
      }
    }

    if (!client) {
      // No cookie, or an explicit preferredClientId that didn't resolve:
      // send the admin to the switcher instead of guessing a client.
      redirect("/admin");
    }
  }

  if (!client && !canViewAs) {
    redirect("/login?error=no_membership");
  }

  return {
    supabase,
    user,
    client,
    role,
    viewingAs,
    isSitewyreAdmin,
    isAgencyAdmin,
    agencyId,
    // Broadened to "can access /admin" (sitewyre_admin or agency_admin) —
    // use isSitewyreAdmin above for anything platform-only.
    isAdmin: canViewAs,
    memberships: list,
  };
}

/**
 * sitewyre_admin or agency_admin, with no client resolution. Use this for
 * /admin itself (and actions both roles may use) instead of
 * requireMembership — requireMembership can redirect to /admin, so if
 * /admin also called requireMembership it would risk a redirect loop.
 * This never reads or depends on the admin_view_client_id cookie.
 * agencyId is null for a sitewyre_admin (who sees every agency).
 */
export async function requireAgencyOrSitewyreAdmin() {
  const { supabase, user } = await requireUser();

  const { data: memberships } = await supabase
    .from("memberships")
    .select("*")
    .eq("user_id", user.id);

  const isSitewyreAdmin = ((memberships ?? []) as MembershipRow[]).some(
    (m) => m.role === "sitewyre_admin",
  );
  const agencyId = isSitewyreAdmin
    ? null
    : await getAgencyAdminAgencyId(supabase, user.id);

  if (!isSitewyreAdmin && !agencyId) redirect("/");

  return { supabase, user, isSitewyreAdmin, agencyId };
}

/**
 * Strictly sitewyre_admin — use for platform-only actions (Stripe
 * customer linking, Twilio number purchases, A2P "same legal entity",
 * SMS/AI allowances, manual A2P status overrides): anything an agency
 * shouldn't be able to do for its own sub-accounts.
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
