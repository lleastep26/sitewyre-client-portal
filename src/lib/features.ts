import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

export async function hasFeature(
  supabase: SupabaseClient<Database>,
  plan: string,
  feature: string,
) {
  const { data } = await supabase
    .from("plan_features")
    .select("enabled")
    .eq("plan", plan)
    .eq("feature", feature)
    .maybeSingle();
  return data?.enabled ?? true;
}
