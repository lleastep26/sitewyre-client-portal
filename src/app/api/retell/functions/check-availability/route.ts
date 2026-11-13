import { createAdminClient } from "@/lib/supabase/admin";
import {
  readVerifiedRetellBody,
  clientIdFromCall,
  jsonResult,
  type RetellFunctionCallBody,
} from "@/lib/retell/webhook";
import { checkAvailabilityForService } from "@/lib/assistant/booking";

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

  const result = await checkAvailabilityForService(supabase, {
    clientId,
    serviceName: String(body.args.service_name ?? ""),
    earliest: typeof body.args.earliest === "string" ? body.args.earliest : null,
    timeZone: client.timezone,
  });
  return jsonResult(result);
}
