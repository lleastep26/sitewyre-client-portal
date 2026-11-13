import { createAdminClient } from "@/lib/supabase/admin";
import {
  readVerifiedRetellBody,
  clientIdFromCall,
  jsonResult,
  type RetellFunctionCallBody,
} from "@/lib/retell/webhook";
import { findOpenSlots } from "@/lib/scheduling/service-slots";

export async function POST(request: Request) {
  const raw = await readVerifiedRetellBody(request);
  if (!raw) return new Response("Invalid signature", { status: 401 });
  const body = JSON.parse(raw) as RetellFunctionCallBody;

  const clientId = clientIdFromCall(body.call);
  if (!clientId) return jsonResult({ error: "Unknown client." });

  const supabase = createAdminClient();
  const { data: client } = await supabase
    .from("clients")
    .select("id, timezone")
    .eq("id", clientId)
    .maybeSingle();
  if (!client) return jsonResult({ error: "Unknown client." });

  const serviceName = String(body.args.service_name ?? "").trim();
  if (!serviceName) return jsonResult({ error: "Which service is this for?" });

  const { data: service } = await supabase
    .from("services")
    .select("id, name, duration_minutes")
    .eq("client_id", clientId)
    .eq("bookable_online", true)
    .ilike("name", `%${serviceName}%`)
    .maybeSingle();
  if (!service) {
    return jsonResult({ error: `No bookable service matching "${serviceName}".` });
  }

  const timeZone = client.timezone ?? "America/Chicago";
  const earliestRaw = typeof body.args.earliest === "string" ? body.args.earliest : null;
  const earliest = earliestRaw ? new Date(earliestRaw) : new Date();
  const from = Number.isNaN(earliest.getTime()) ? new Date() : earliest;
  const fromYmd = from.toISOString().slice(0, 10);
  const toYmd = new Date(from.getTime() + 7 * 86_400_000).toISOString().slice(0, 10);

  const slots = await findOpenSlots(supabase, {
    clientId,
    serviceId: service.id,
    fromYmd,
    toYmd,
    timeZone,
  });

  return jsonResult({
    service: service.name,
    timezone: timeZone,
    available_times: slots.slice(0, 6).map((s) => s.toISOString()),
  });
}
