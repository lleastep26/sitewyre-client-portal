import { createAdminClient } from "@/lib/supabase/admin";
import { json, options } from "@/lib/http/cors";
import { generateSlots, wallTimeToUtc } from "@/lib/scheduling/slots";
import { ensureDefaultAvailability } from "@/lib/scheduling/availability";

export function OPTIONS() {
  return options();
}

function parseYmd(raw: string): string | null {
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const siteKey = url.searchParams.get("site_key");
  const serviceId = url.searchParams.get("service_id");
  const fromRaw = url.searchParams.get("from");
  const toRaw = url.searchParams.get("to");

  if (!siteKey || !serviceId || !fromRaw || !toRaw) {
    return json(
      { error: "site_key, service_id, from, and to are required" },
      400,
    );
  }

  const fromYmd = parseYmd(fromRaw);
  const toYmd = parseYmd(toRaw);
  if (!fromYmd || !toYmd) return json({ error: "Invalid from/to" }, 400);

  const supabase = createAdminClient();
  const { data: client } = await supabase
    .from("clients")
    .select("id, timezone, user_id")
    .eq("site_key", siteKey)
    .maybeSingle();
  if (!client) return json({ error: "Not found" }, 404);

  const timeZone = client.timezone ?? "America/Chicago";

  if (client.user_id) {
    await ensureDefaultAvailability(supabase, client.id, client.user_id).catch(
      () => undefined,
    );
  }

  const { data: service } = await supabase
    .from("services")
    .select("*")
    .eq("id", serviceId)
    .eq("client_id", client.id)
    .eq("bookable_online", true)
    .maybeSingle();
  if (!service) return json({ error: "Service not found" }, 404);

  const { data: availability } = await supabase
    .from("availability")
    .select("weekday, start_time, end_time, buffer_minutes, min_notice_hours")
    .eq("client_id", client.id);

  if (!availability?.length) {
    return json({ slots: [], timezone: timeZone });
  }

  // Noon anchors avoid UTC-midnight shifting the civil date in the client TZ.
  const dateFrom = wallTimeToUtc(fromYmd, 12 * 60, timeZone);
  const dateTo = wallTimeToUtc(toYmd, 12 * 60, timeZone);
  const rangeStart = wallTimeToUtc(fromYmd, 0, timeZone);
  const rangeEnd = wallTimeToUtc(toYmd, 24 * 60 - 1, timeZone);

  const { data: appointments } = await supabase
    .from("appointments")
    .select("start_at, end_at")
    .eq("client_id", client.id)
    .neq("status", "cancelled")
    .lt("start_at", rangeEnd.toISOString())
    .gt("end_at", rangeStart.toISOString());

  const slots = generateSlots({
    dateFrom,
    dateTo,
    durationMinutes: service.duration_minutes,
    availability,
    busy: appointments ?? [],
    timeZone,
  });

  return json({
    slots: slots.map((s) => s.toISOString()),
    duration_minutes: service.duration_minutes,
    timezone: timeZone,
  });
}
