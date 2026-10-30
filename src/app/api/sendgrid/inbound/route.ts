import { createAdminClient } from "@/lib/supabase/admin";
import { findOrCreateContact } from "@/lib/crm/contacts";

export async function POST(request: Request) {
  const form = await request.formData();
  const from = String(form.get("from") ?? "");
  const to = String(form.get("to") ?? "");
  const subject = String(form.get("subject") ?? "");
  const text = String(form.get("text") ?? form.get("html") ?? "");
  const emailMatch = from.match(/<([^>]+)>/)?.[1] ?? from;

  const supabase = createAdminClient();
  // Match client by owner email domain or site inbound alias later; for now first active client with matching business email
  const { data: clients } = await supabase.from("clients").select("*").limit(50);
  const client =
    clients?.find((c) => to.toLowerCase().includes((c.site_key ?? "").toLowerCase())) ??
    clients?.[0];

  if (!client) {
    return Response.json({ ok: false }, { status: 404 });
  }

  const contact = await findOrCreateContact(supabase, {
    clientId: client.id,
    name: emailMatch.split("@")[0] ?? emailMatch,
    phone: "",
    email: emailMatch,
    source: "email",
  });

  await supabase.from("messages").insert({
    client_id: client.id,
    contact_id: contact.id,
    channel: "email",
    direction: "inbound",
    body: subject ? `${subject}\n\n${text}` : text,
    status: "received",
  });

  return Response.json({ ok: true });
}
