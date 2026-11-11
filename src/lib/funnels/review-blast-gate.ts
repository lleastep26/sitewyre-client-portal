import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { getAutomationState } from "@/lib/automations";
import { isOptedOut } from "./opt-out";
import { hasRepliedSince } from "./human-reply";

export type ReviewBlastStopReason = "disabled" | "opted_out" | "replied" | "clicked";

/**
 * Re-checked fresh before every send (step 1 and the +3d reminder) — a
 * review funnel stops on an opt-out or any reply, same principle as
 * review_request. `checkClicked` is false for step 1 (nothing to have
 * clicked yet) and true before the reminder.
 */
export async function shouldStopReviewBlast(
  supabase: SupabaseClient<Database>,
  params: {
    clientId: string;
    phone: string;
    contactId: string;
    since: string;
    reviewToken: string;
    checkClicked: boolean;
  },
): Promise<{ stop: true; reason: ReviewBlastStopReason } | { stop: false }> {
  const auto = await getAutomationState(supabase, params.clientId, "review_blast");
  if (!auto.enabled) return { stop: true, reason: "disabled" };

  if (
    await isOptedOut(supabase, params.clientId, params.phone, params.contactId)
  ) {
    return { stop: true, reason: "opted_out" };
  }

  if (await hasRepliedSince(supabase, params.contactId, params.since)) {
    return { stop: true, reason: "replied" };
  }

  if (params.checkClicked) {
    const { data: link } = await supabase
      .from("review_links")
      .select("clicked_at")
      .eq("token", params.reviewToken)
      .maybeSingle();
    if (link?.clicked_at) return { stop: true, reason: "clicked" };
  }

  return { stop: false };
}
