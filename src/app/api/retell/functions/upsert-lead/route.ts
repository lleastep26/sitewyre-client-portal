import { createAdminClient } from "@/lib/supabase/admin";
import {
  readVerifiedRetellBody,
  clientIdFromCall,
  jsonResult,
  type RetellFunctionCallBody,
} from "@/lib/retell/webhook";
import { findOrCreateContact } from "@/lib/crm/contacts";
import { normalizePhone } from "@/lib/utils";
import { findOpenLeadForPhone } from "@/lib/leads/lifecycle";
import { inngest } from "@/lib/inngest/client";

export async function POST(request: Request) {
  const raw = await readVerifiedRetellBody(request);
  if (!raw) return new Response("Invalid signature", { status: 401 });
  const body = JSON.parse(raw) as RetellFunctionCallBody;

  const clientId = clientIdFromCall(body.call);
  if (!clientId) return jsonResult({ error: "Unknown client." });

  const supabase = createAdminClient();
  const { data: client } = await supabase
    .from("clients")
    .select("id, user_id")
    .eq("id", clientId)
    .maybeSingle();
  if (!client) return jsonResult({ error: "Unknown client." });

  const callerName = String(body.args.caller_name ?? "").trim();
  if (!callerName) return jsonResult({ error: "Need the caller's name." });

  const metadataPhone =
    typeof body.call.metadata?.caller_number === "string" ? body.call.metadata.caller_number : "";
  const callerPhoneRaw =
    typeof body.args.caller_phone === "string" && body.args.caller_phone ? body.args.caller_phone : metadataPhone;
  const callerPhone = normalizePhone(callerPhoneRaw);
  const reason = typeof body.args.reason === "string" && body.args.reason ? body.args.reason : "AI receptionist call";

  let contactId: string | null = null;
  if (callerPhone) {
    const contact = await findOrCreateContact(supabase, {
      clientId,
      name: callerName,
      phone: callerPhone,
      source: "ai_receptionist",
    });
    contactId = contact.id;
  }

  const existing = callerPhone ? await findOpenLeadForPhone(supabase, clientId, callerPhone) : null;
  if (existing) {
    await supabase
      .from("leads")
      .update({ message: reason, last_activity_at: new Date().toISOString() })
      .eq("id", existing.id);
    return jsonResult({ ok: true, lead_id: existing.id });
  }

  const { data: stage } = await supabase
    .from("pipeline_stages")
    .select("id")
    .eq("client_id", clientId)
    .eq("name", "New")
    .maybeSingle();

  const { data: lead, error } = await supabase
    .from("leads")
    .insert({
      client_id: clientId,
      contact_id: contactId,
      stage_id: stage?.id ?? null,
      name: callerName,
      phone: callerPhone || "unknown",
      message: reason,
      source: "ai_receptionist",
      owner_id: client.user_id,
      last_activity_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (error) return jsonResult({ error: error.message });

  await inngest
    .send({
      name: "portal/lead.created",
      // The owner gets one text per call, after it ends.
      data: { clientId, leadId: lead.id, phone: callerPhone, name: callerName, skipOwnerAlert: true },
    })
    .catch(() => undefined);

  return jsonResult({ ok: true, lead_id: lead.id });
}
