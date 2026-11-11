import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

/**
 * True if this contact has a review_links row (from either review_request
 * or review_blast — both create one) within the last `windowDays`. Shared
 * by jobs/actions.ts's Job Complete guard and the review-blast preview, so
 * "no second review request within 90 days" means the same thing in both.
 */
export async function hasRecentReviewRequest(
  supabase: SupabaseClient<Database>,
  contactId: string,
  windowDays = 90,
): Promise<boolean> {
  const sinceIso = new Date(
    Date.now() - windowDays * 24 * 60 * 60 * 1000,
  ).toISOString();
  const { data } = await supabase
    .from("review_links")
    .select("created_at")
    .eq("contact_id", contactId)
    .gte("created_at", sinceIso)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return Boolean(data);
}
