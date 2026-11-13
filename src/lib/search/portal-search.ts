"use server";

import { requireMembership } from "@/lib/auth/session";
import { ALL_PAGE_NAV_ITEMS } from "@/components/shell/nav-config";
import { getTradePreset } from "@/lib/trade-presets";

export type PortalSearchResult = {
  pages: { href: string; label: string }[];
  contacts: { id: string; name: string; phone: string | null }[];
  leads: { id: string; name: string; phone: string }[];
  jobs: { id: string; address: string | null; contactName: string | null }[];
};

const EMPTY: PortalSearchResult = { pages: [], contacts: [], leads: [], jobs: [] };

/**
 * Scoped to the current membership's client exactly like every other query
 * in this app (requireMembership already resolves the admin view-as client
 * correctly) — RLS still enforces this underneath, this just matches the
 * view-as client precisely rather than "any client the admin can see."
 */
export async function searchPortal(query: string): Promise<PortalSearchResult> {
  const q = query.trim();
  if (!q) return EMPTY;

  const { supabase, client, isAdmin } = await requireMembership();
  if (!client) return EMPTY;

  const jobsLabel = getTradePreset(client.trade ?? "other").labels.jobNounPlural;
  const lower = q.toLowerCase();
  const pages = ALL_PAGE_NAV_ITEMS.filter((item) => {
    if (item.href === "/admin" && !isAdmin) return false;
    const haystack = [item.label, ...(item.keywords ?? [])].join(" ").toLowerCase();
    return haystack.includes(lower);
  }).map((item) => ({
    href: item.href,
    label: item.href === "/jobs" ? jobsLabel : item.label,
  }));

  const likeQ = `%${q}%`;
  const digits = q.replace(/\D/g, "");

  const [{ data: leadRows }, { data: contactRows }] = await Promise.all([
    supabase
      .from("leads")
      .select("id, name, phone")
      .eq("client_id", client.id)
      .or(`name.ilike.${likeQ},phone.ilike.${likeQ}`)
      .limit(8),
    supabase
      .from("contacts")
      .select("id, name, phones")
      .eq("client_id", client.id)
      .ilike("name", likeQ)
      .limit(20),
  ]);

  // Array columns can't be `ilike`d by Postgres/PostgREST directly, so a
  // phone search over contacts' `phones[]` is matched in app code — fine at
  // the scale of one contractor's contact list, not meant to scale further.
  let contactPhoneMatches: { id: string; name: string; phones: string[] }[] = [];
  if (digits.length >= 3) {
    const { data: candidates } = await supabase
      .from("contacts")
      .select("id, name, phones")
      .eq("client_id", client.id)
      .limit(500);
    contactPhoneMatches = (candidates ?? []).filter((c) =>
      (c.phones ?? []).some((p) => p.replace(/\D/g, "").includes(digits)),
    );
  }

  const contactById = new Map<string, { id: string; name: string; phones: string[] }>();
  for (const c of contactRows ?? []) contactById.set(c.id, c);
  for (const c of contactPhoneMatches) contactById.set(c.id, c);

  const contacts = Array.from(contactById.values())
    .slice(0, 8)
    .map((c) => ({ id: c.id, name: c.name, phone: c.phones?.[0] ?? null }));

  let jobs: PortalSearchResult["jobs"] = [];
  if (contactById.size > 0) {
    const { data: jobRows } = await supabase
      .from("jobs")
      .select("id, address, contact_id")
      .eq("client_id", client.id)
      .in("contact_id", Array.from(contactById.keys()))
      .limit(8);
    jobs = (jobRows ?? []).map((j) => ({
      id: j.id,
      address: j.address,
      contactName: j.contact_id ? (contactById.get(j.contact_id)?.name ?? null) : null,
    }));
  }

  return {
    pages,
    contacts,
    leads: (leadRows ?? []).map((l) => ({ id: l.id, name: l.name, phone: l.phone })),
    jobs,
  };
}
