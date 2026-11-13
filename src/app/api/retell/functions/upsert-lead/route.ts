import { createAdminClient } from "@/lib/supabase/admin";
import {
  readVerifiedRetellBody,
  clientIdFromCall,
  jsonResult,
  type RetellFunctionCallBody,
} from "@/lib/retell/webhook";
import { findContactByPhone, findOrCreateContact } from "@/lib/crm/contacts";
import { normalizePhone } from "@/lib/utils";
import {
  createCallLead,
  findLeadForCall,
  isFromThisCall,
  touchCallLead,
} from "@/lib/retell/call-lead";

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

  // The number they're calling from identifies the caller; a different
  // number they ask to be reached on becomes the lead's phone.
  const callerIdPhone = normalizePhone(
    typeof body.call.metadata?.caller_number === "string" ? body.call.metadata.caller_number : "",
  );
  const statedPhone = normalizePhone(
    typeof body.args.caller_phone === "string" ? body.args.caller_phone : "",
  );
  const callerPhone = statedPhone || callerIdPhone;
  const identityPhone = callerIdPhone || statedPhone;
  const reason = typeof body.args.reason === "string" && body.args.reason ? body.args.reason : "AI receptionist call";
  const now = new Date();
  const callStartedAt =
    typeof body.call.start_timestamp === "number" ? new Date(body.call.start_timestamp) : null;

  let contactId: string | null = null;
  if (identityPhone) {
    const contact = await findOrCreateContact(supabase, {
      clientId,
      name: callerName,
      phone: identityPhone,
      source: "ai_receptionist",
    });
    contactId = contact.id;

    // The agent calls this again when the caller corrects their name or
    // number. Only a contact made on this call is changed; an existing
    // customer's record is never renamed by a phone call.
    const patch: { name?: string; phones?: string[] } = {};
    const madeOnThisCall =
      contact.source === "ai_receptionist" && isFromThisCall(contact.created_at, now, callStartedAt);
    if (contact.name !== callerName && (madeOnThisCall || contact.name === identityPhone)) {
      patch.name = callerName;
    }
    if (
      callerPhone !== identityPhone &&
      !contact.phones.includes(callerPhone) &&
      !(await findContactByPhone(supabase, clientId, callerPhone))
    ) {
      patch.phones = [...contact.phones, callerPhone];
    }
    if (patch.name || patch.phones) {
      await supabase.from("contacts").update(patch).eq("id", contact.id);
    }
  }

  // Reuse the caller's lead only when it's still a live enquiry; an old
  // one is left alone and this call starts a new lead.
  const existing = callerPhone
    ? await findLeadForCall(supabase, clientId, callerPhone, { now, callStartedAt, contactId })
    : null;
  if (existing) {
    await touchCallLead(supabase, clientId, existing, {
      contactId,
      name: callerName,
      phone: callerPhone,
      message: reason,
    });
    return jsonResult({ ok: true, lead_id: existing.id });
  }

  const { lead, error } = await createCallLead(supabase, {
    client,
    contactId,
    name: callerName,
    phone: callerPhone,
    message: reason,
  });
  if (!lead) return jsonResult({ error });

  return jsonResult({ ok: true, lead_id: lead.id });
}
