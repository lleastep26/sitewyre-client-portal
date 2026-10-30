import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

export type AvailabilityRow = {
  id: string;
  client_id: string;
  user_id: string;
  weekday: number;
  start_time: string;
  end_time: string;
  buffer_minutes: number;
  min_notice_hours: number;
};

const WEEKDAY_LABELS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

export function weekdayLabel(weekday: number) {
  return WEEKDAY_LABELS[weekday] ?? `Day ${weekday}`;
}

/** Seed Mon–Fri 09:00–17:00 if the client has no availability rows. */
export async function ensureDefaultAvailability(
  supabase: SupabaseClient<Database>,
  clientId: string,
  userId: string,
) {
  const { count } = await supabase
    .from("availability")
    .select("id", { count: "exact", head: true })
    .eq("client_id", clientId);

  if ((count ?? 0) > 0) return { seeded: false };

  const rows = [1, 2, 3, 4, 5].map((weekday) => ({
    client_id: clientId,
    user_id: userId,
    weekday,
    start_time: "09:00:00",
    end_time: "17:00:00",
    buffer_minutes: 15,
    min_notice_hours: 2,
  }));

  const { error } = await supabase.from("availability").insert(rows);
  if (error) throw new Error(error.message);
  return { seeded: true };
}

export async function listAvailability(
  supabase: SupabaseClient<Database>,
  clientId: string,
) {
  const { data, error } = await supabase
    .from("availability")
    .select("*")
    .eq("client_id", clientId)
    .order("weekday", { ascending: true })
    .order("start_time", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as AvailabilityRow[];
}
