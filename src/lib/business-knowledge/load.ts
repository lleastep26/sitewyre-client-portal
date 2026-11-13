import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

/** The non-client parts of the Business knowledge summary — bookable
 * services, business hours and FAQs — loaded the same way for the AI
 * receptionist and the AI text assistant. */
export async function loadBusinessKnowledgeParts(
  supabase: SupabaseClient<Database>,
  clientId: string,
) {
  const [{ data: services }, { data: availability }, { data: faqs }] = await Promise.all([
    supabase
      .from("services")
      .select("name, duration_minutes")
      .eq("client_id", clientId)
      .eq("bookable_online", true),
    supabase
      .from("availability")
      .select("weekday, start_time, end_time")
      .eq("client_id", clientId),
    supabase
      .from("client_faqs")
      .select("question, answer")
      .eq("client_id", clientId)
      .order("position", { ascending: true }),
  ]);
  return {
    bookableServices: services ?? [],
    availability: availability ?? [],
    faqs: faqs ?? [],
  };
}
