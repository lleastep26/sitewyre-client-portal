import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { generateSlots, wallTimeToUtc } from "./slots";
import { getExternalBusyTimes } from "./calendar-sync";

type Admin = SupabaseClient<Database>;

/** Open start times for a service, within [fromYmd, toYmd] — the same
 * availability + appointments + external-calendar-busy build used by the
 * public booking widget (src/app/api/public/slots/route.ts), reused here
 * for the AI receptionist's check_availability tool. */
export async function findOpenSlots(
  supabase: Admin,
  opts: {
    clientId: string;
    serviceId: string;
    fromYmd: string;
    toYmd: string;
    timeZone: string;
  },
): Promise<Date[]> {
  const { data: availability } = await supabase
    .from("availability")
    .select("weekday, start_time, end_time, buffer_minutes, min_notice_hours")
    .eq("client_id", opts.clientId);
  if (!availability?.length) return [];

  const { data: service } = await supabase
    .from("services")
    .select("duration_minutes")
    .eq("id", opts.serviceId)
    .eq("client_id", opts.clientId)
    .maybeSingle();
  if (!service) return [];

  const dateFrom = wallTimeToUtc(opts.fromYmd, 12 * 60, opts.timeZone);
  const dateTo = wallTimeToUtc(opts.toYmd, 12 * 60, opts.timeZone);
  const rangeStart = wallTimeToUtc(opts.fromYmd, 0, opts.timeZone);
  const rangeEnd = wallTimeToUtc(opts.toYmd, 24 * 60 - 1, opts.timeZone);

  const { data: appointments } = await supabase
    .from("appointments")
    .select("start_at, end_at")
    .eq("client_id", opts.clientId)
    .neq("status", "cancelled")
    .lt("start_at", rangeEnd.toISOString())
    .gt("end_at", rangeStart.toISOString());

  const externalBusy = await getExternalBusyTimes(supabase, opts.clientId, rangeStart, rangeEnd);

  return generateSlots({
    dateFrom,
    dateTo,
    durationMinutes: service.duration_minutes,
    availability,
    busy: [...(appointments ?? []), ...externalBusy],
    timeZone: opts.timeZone,
  });
}
