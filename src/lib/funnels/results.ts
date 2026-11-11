import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { findContactByPhone } from "@/lib/crm/contacts";
import { hasRepliedSince } from "@/lib/funnels/human-reply";

export type FunnelResults = {
  missedCallTextBack: { textedBack: number; recovered: number };
  reviewRequest: { sent: number; linksClicked: number };
  reviewBlast: { sent: number; linksClicked: number };
};

export async function countSentByTrigger(
  supabase: SupabaseClient<Database>,
  clientId: string,
  trigger: string,
  sinceIso: string,
): Promise<number> {
  const { count } = await supabase
    .from("workflow_runs")
    .select("id", { count: "exact", head: true })
    .eq("client_id", clientId)
    .eq("trigger", trigger)
    .eq("status", "sent")
    .gte("created_at", sinceIso);
  return count ?? 0;
}

export async function countClickedReviewLinks(
  supabase: SupabaseClient<Database>,
  clientId: string,
  source: "review_request" | "review_blast",
  sinceIso: string,
): Promise<number> {
  const { count } = await supabase
    .from("review_links")
    .select("token", { count: "exact", head: true })
    .eq("client_id", clientId)
    .eq("source", source)
    .not("clicked_at", "is", null)
    .gte("clicked_at", sinceIso);
  return count ?? 0;
}

/**
 * "Recovered" means the contact replied after the auto-text, not just that
 * it sent — workflow_runs only logs the raw phone (no contact_id), so each
 * row is matched to a contact by phone, then checked with hasRepliedSince.
 * Fine at the volume one client's missed calls run at in 30 days; not meant
 * to scale to a bulk/cross-client report.
 */
export async function countMissedCallRecovery(
  supabase: SupabaseClient<Database>,
  clientId: string,
  sinceIso: string,
): Promise<{ textedBack: number; recovered: number }> {
  const { data } = await supabase
    .from("workflow_runs")
    .select("created_at, log")
    .eq("client_id", clientId)
    .eq("trigger", "missed_call_text_back")
    .eq("status", "sent")
    .gte("created_at", sinceIso);

  const runs = data ?? [];
  let recovered = 0;
  for (const run of runs) {
    const phone = (run.log as { from?: string } | null)?.from;
    if (!phone) continue;
    const contact = await findContactByPhone(supabase, clientId, phone);
    if (!contact) continue;
    if (await hasRepliedSince(supabase, contact.id, run.created_at)) {
      recovered++;
    }
  }
  return { textedBack: runs.length, recovered };
}

export async function getFunnelResults(
  supabase: SupabaseClient<Database>,
  clientId: string,
  days = 30,
): Promise<FunnelResults> {
  const sinceIso = new Date(Date.now() - days * 86_400_000).toISOString();

  const [
    missedCallTextBack,
    reviewRequestSent,
    reviewRequestClicks,
    reviewBlastSent,
    reviewBlastClicks,
  ] = await Promise.all([
    countMissedCallRecovery(supabase, clientId, sinceIso),
    countSentByTrigger(supabase, clientId, "review_request", sinceIso),
    countClickedReviewLinks(supabase, clientId, "review_request", sinceIso),
    countSentByTrigger(supabase, clientId, "review_blast", sinceIso),
    countClickedReviewLinks(supabase, clientId, "review_blast", sinceIso),
  ]);

  return {
    missedCallTextBack,
    reviewRequest: { sent: reviewRequestSent, linksClicked: reviewRequestClicks },
    reviewBlast: { sent: reviewBlastSent, linksClicked: reviewBlastClicks },
  };
}
