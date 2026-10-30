import { createBearerClient, getBearerToken } from "@/lib/auth/bearer";
import { sendInboxMessageForClient } from "@/lib/inbox/send";
import type { ClientRow, MembershipRow } from "@/lib/supabase/types";

export async function POST(request: Request) {
  const token = getBearerToken(request);
  if (!token) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createBearerClient(token);
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser(token);
  if (userErr || !user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    contactId?: string;
    channel?: "sms" | "email" | "note";
    body?: string;
    phone?: string | null;
    email?: string | null;
  };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const channel = body.channel ?? "sms";
  if (!["sms", "email", "note"].includes(channel)) {
    return Response.json({ error: "Invalid channel" }, { status: 400 });
  }
  if (!body.contactId || !body.body?.trim()) {
    return Response.json(
      { error: "contactId and body required" },
      { status: 400 },
    );
  }

  const { data: memberships } = await supabase
    .from("memberships")
    .select("*")
    .eq("user_id", user.id);
  const list = (memberships ?? []) as MembershipRow[];
  const membership =
    list.find((m) => m.role !== "sitewyre_admin") ?? list[0];
  if (!membership) {
    return Response.json({ error: "No membership" }, { status: 403 });
  }
  if (membership.role === "crew") {
    return Response.json(
      { error: "Crew cannot send from owner inbox API" },
      { status: 403 },
    );
  }

  const { data: client } = await supabase
    .from("clients")
    .select("*")
    .eq("id", membership.client_id)
    .maybeSingle();
  if (!client) {
    return Response.json({ error: "No client" }, { status: 403 });
  }

  const result = await sendInboxMessageForClient(
    supabase,
    client as ClientRow,
    {
      contactId: body.contactId,
      channel,
      body: body.body,
      phone: body.phone,
      email: body.email,
    },
  );

  if ("error" in result) {
    return Response.json({ error: result.error }, { status: 400 });
  }
  return Response.json({ ok: true });
}
