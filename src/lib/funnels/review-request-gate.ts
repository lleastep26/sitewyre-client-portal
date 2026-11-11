import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { getAutomationState } from "@/lib/automations";
import { isOptedOut } from "./opt-out";
import { hasRepliedSince } from "./human-reply";
import { checkA2pGate } from "./a2p-gate";

export type ReviewDripStopReason =
  | "disabled"
  | "opted_out"
  | "replied"
  | "clicked"
  | `a2p_${string}`;

export type ReviewDripGateResult =
  | { stop: true; reason: ReviewDripStopReason }
  | { stop: false; templateBody: string | null };

/**
 * Re-checked fresh before every step of the review-request drip — never
 * cached from an earlier step, since any of these can change while the
 * function is asleep between steps.
 */
export async function shouldStopReviewDrip(
  supabase: SupabaseClient<Database>,
  params: {
    clientId: string;
    phone: string;
    contactId?: string | null;
    completedAt: string;
    reviewToken: string;
  },
): Promise<ReviewDripGateResult> {
  const auto = await getAutomationState(
    supabase,
    params.clientId,
    "review_request",
  );
  if (!auto.enabled) return { stop: true, reason: "disabled" };

  const { data: client } = await supabase
    .from("clients")
    .select("a2p_status, phone")
    .eq("id", params.clientId)
    .maybeSingle();
  const a2p = checkA2pGate(client, params.phone);
  if (!a2p.allowed) {
    return { stop: true, reason: a2p.reason as ReviewDripStopReason };
  }

  if (
    await isOptedOut(supabase, params.clientId, params.phone, params.contactId)
  ) {
    return { stop: true, reason: "opted_out" };
  }

  if (
    params.contactId &&
    (await hasRepliedSince(supabase, params.contactId, params.completedAt))
  ) {
    return { stop: true, reason: "replied" };
  }

  const { data: link } = await supabase
    .from("review_links")
    .select("clicked_at")
    .eq("token", params.reviewToken)
    .maybeSingle();
  if (link?.clicked_at) return { stop: true, reason: "clicked" };

  return { stop: false, templateBody: auto.templateBody };
}
