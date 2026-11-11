import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

/**
 * True if the contact has sent any inbound message since `sinceIso` — a
 * human has taken over the conversation. Used only to stop a review
 * funnel's remaining reminders; appointment/other reminders are not a
 * funnel and keep sending regardless of a reply.
 */
export async function hasRepliedSince(
  supabase: SupabaseClient<Database>,
  contactId: string,
  sinceIso: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("messages")
    .select("id")
    .eq("contact_id", contactId)
    .eq("direction", "inbound")
    .gt("created_at", sinceIso)
    .limit(1)
    .maybeSingle();
  return Boolean(data);
}
