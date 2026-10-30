import { createClient } from "@/lib/supabase/server";
import { getVapidPublicKey } from "@/lib/push/web-push";

export async function GET() {
  return Response.json({
    publicKey: getVapidPublicKey(),
    configured: Boolean(getVapidPublicKey()),
  });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  let body: {
    endpoint?: string;
    keys?: { p256dh?: string; auth?: string };
    clientId?: string;
  };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.endpoint || !body.keys?.p256dh || !body.keys?.auth) {
    return Response.json({ error: "Invalid subscription" }, { status: 400 });
  }

  let clientId = body.clientId;
  if (!clientId) {
    const { data: membership } = await supabase
      .from("memberships")
      .select("client_id")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle();
    clientId = membership?.client_id;
  }
  if (!clientId) {
    return Response.json({ error: "No client" }, { status: 400 });
  }

  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      user_id: user.id,
      client_id: clientId,
      endpoint: body.endpoint,
      p256dh: body.keys.p256dh,
      auth: body.keys.auth,
    },
    { onConflict: "user_id,endpoint" },
  );
  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
  return Response.json({ ok: true });
}
