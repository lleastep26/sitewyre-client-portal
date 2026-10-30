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
  // Require an explicit site_key in the recipient address so mail cannot
  // be attributed to an arbitrary "first" client.
  const { data: clients } = await supabase
    .from("clients")
    .select("*")
    .not("site_key", "is", null)
    .limit(100);
  const toLower = to.toLowerCase();
  const client = clients?.find((c) => {
    const key = (c.site_key ?? "").toLowerCase();
    return key.length > 0 && toLower.includes(key);
  });

  if (!client) {
    return Response.json(
      { ok: false, error: "Unknown inbound recipient (missing site_key)" },
      { status: 404 },
    );
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
