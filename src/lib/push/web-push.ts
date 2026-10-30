import webpush from "web-push";
import { createAdminClient } from "@/lib/supabase/admin";

function configured() {
  return Boolean(
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY &&
      process.env.VAPID_PRIVATE_KEY &&
      process.env.VAPID_SUBJECT,
  );
}

export function getVapidPublicKey() {
  return process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";
}

export async function sendPushToClient(
  clientId: string,
  payload: { title: string; body: string; url?: string },
) {
  if (!configured()) return { skipped: true as const, reason: "no_vapid" };

  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT!,
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  );

  const supabase = createAdminClient();
  const { data: subs } = await supabase
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("client_id", clientId);

  let sent = 0;
  for (const sub of subs ?? []) {
    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        },
        JSON.stringify(payload),
      );
      sent += 1;
    } catch (err) {
      const status =
        err && typeof err === "object" && "statusCode" in err
          ? Number((err as { statusCode?: number }).statusCode)
          : 0;
      if (status === 404 || status === 410) {
        await supabase.from("push_subscriptions").delete().eq("id", sub.id);
      }
      console.warn("push send failed", err);
    }
  }
  return { ok: true as const, sent };
}
