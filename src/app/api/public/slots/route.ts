import { createAdminClient } from "@/lib/supabase/admin";
import { json, options } from "@/lib/http/cors";
import { generateSlots } from "@/lib/scheduling/slots";
import { ensureDefaultAvailability } from "@/lib/scheduling/availability";

export function OPTIONS() {
  return options();
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const siteKey = url.searchParams.get("site_key");
  const serviceId = url.searchParams.get("service_id");
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");

  if (!siteKey || !serviceId || !from || !to) {
    return json(
      { error: "site_key, service_id, from, and to are required" },
      400,
    );
  }

  const dateFrom = new Date(from.includes("T") ? from : `${from}T12:00:00`);
  const dateTo = new Date(to.includes("T") ? to : `${to}T12:00:00`);
  if (Number.isNaN(dateFrom.getTime()) || Number.isNaN(dateTo.getTime())) {
    return json({ error: "Invalid from/to" }, 400);
  }

  const supabase = createAdminClient();
  const { data: client } = await supabase
    .from("clients")
    .select("id, timezone, user_id")
    .eq("site_key", siteKey)
    .maybeSingle();
  if (!client) return json({ error: "Not found" }, 404);

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
    return json({ slots: [], timezone: client.timezone });
  }

  const rangeStart = new Date(dateFrom);
  rangeStart.setHours(0, 0, 0, 0);
  const rangeEnd = new Date(dateTo);
  rangeEnd.setHours(23, 59, 59, 999);

  const { data: appointments } = await supabase
    .from("appointments")
    .select("start_at, end_at")
    .eq("client_id", client.id)
    .neq("status", "cancelled")
    .lt("start_at", rangeEnd.toISOString())
    .gt("end_at", rangeStart.toISOString());

  const slots = generateSlots({
    dateFrom: rangeStart,
    dateTo: new Date(dateTo.getFullYear(), dateTo.getMonth(), dateTo.getDate()),
    durationMinutes: service.duration_minutes,
    availability,
    busy: appointments ?? [],
    timeZone: client.timezone ?? "America/Chicago",
  });

  return json({
    slots: slots.map((s) => s.toISOString()),
    duration_minutes: service.duration_minutes,
    timezone: client.timezone,
  });
}
