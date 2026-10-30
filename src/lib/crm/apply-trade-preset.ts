import type { SupabaseClient } from "@supabase/supabase-js";
import { getTradePreset } from "@/lib/trade-presets";
import type { Database } from "@/lib/supabase/types";

type Admin = SupabaseClient<Database>;

export async function applyTradePreset(
  supabase: Admin,
  clientId: string,
  trade: string,
) {
  const preset = getTradePreset(trade);

  const { count } = await supabase
    .from("pipeline_stages")
    .select("*", { count: "exact", head: true })
    .eq("client_id", clientId);

  if (!count) {
    await supabase.from("pipeline_stages").insert(
      preset.stages.map((s) => ({
        client_id: clientId,
        name: s.name,
        position: s.position,
        is_won: Boolean(s.is_won),
        is_lost: Boolean(s.is_lost),
      })),
    );
  }

  const { count: serviceCount } = await supabase
    .from("services")
    .select("*", { count: "exact", head: true })
    .eq("client_id", clientId);

  if (!serviceCount) {
    await supabase.from("services").insert(
      preset.services.map((s) => ({
        client_id: clientId,
        name: s.name,
        duration_minutes: s.duration_minutes,
        default_price: s.default_price,
        bookable_online: true,
      })),
    );
  }

  return preset;
}
