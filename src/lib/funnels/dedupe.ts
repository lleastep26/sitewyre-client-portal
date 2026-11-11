import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

/**
 * True if a "sent" workflow_runs row for this trigger/phone already exists
 * within the last `windowMs` (default 24h) — e.g. don't text the same
 * missed-call number back twice in one day.
 */
export async function hasRecentSend(
  supabase: SupabaseClient<Database>,
  params: {
    clientId: string;
    trigger: string;
    phone: string;
    windowMs?: number;
  },
): Promise<boolean> {
  const { clientId, trigger, phone, windowMs = 24 * 60 * 60 * 1000 } = params;
  const sinceIso = new Date(Date.now() - windowMs).toISOString();
  const { data } = await supabase
    .from("workflow_runs")
    .select("id")
    .eq("client_id", clientId)
    .eq("trigger", trigger)
    .eq("status", "sent")
    .eq("log->>from", phone)
    .gte("created_at", sinceIso)
    .limit(1)
    .maybeSingle();
  return Boolean(data);
}
