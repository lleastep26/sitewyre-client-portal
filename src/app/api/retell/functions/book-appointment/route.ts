import { createAdminClient } from "@/lib/supabase/admin";
import {
  readVerifiedRetellBody,
  clientIdFromCall,
  jsonResult,
  type RetellFunctionCallBody,
} from "@/lib/retell/webhook";
import { bookAppointmentForCustomer } from "@/lib/assistant/booking";

export async function POST(request: Request) {
  const raw = await readVerifiedRetellBody(request);
  if (!raw) return new Response("Invalid signature", { status: 401 });
  const body = JSON.parse(raw) as RetellFunctionCallBody;

  const clientId = clientIdFromCall(body.call);
  if (!clientId) return jsonResult({ error: "Unknown client." });

  const supabase = createAdminClient();
  const { data: client } = await supabase.from("clients").select("*").eq("id", clientId).maybeSingle();
  if (!client) return jsonResult({ error: "Unknown client." });

  if (!client.ai_receptionist_booking_enabled) {
    return jsonResult({
      error: "Booking isn't enabled for this business — take a message instead with create_or_update_lead.",
    });
  }

  const metadataPhone =
    typeof body.call.metadata?.caller_number === "string" ? body.call.metadata.caller_number : "";
  const callerPhone =
    typeof body.args.caller_phone === "string" && body.args.caller_phone ? body.args.caller_phone : metadataPhone;

  const result = await bookAppointmentForCustomer(supabase, client, {
    serviceName: String(body.args.service_name ?? ""),
    startAt: new Date(String(body.args.start_at ?? "")),
    customerName: String(body.args.caller_name ?? ""),
    customerPhone: callerPhone || null,
    source: "ai_receptionist",
  });
  return jsonResult(result);
}
