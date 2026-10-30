import { supabase } from "./supabase";

const appUrl =
  process.env.EXPO_PUBLIC_APP_URL?.replace(/\/$/, "") ||
  "https://sitewyre-client-portal.vercel.app";

export async function sendInboxSms(input: {
  contactId: string;
  body: string;
  phone?: string | null;
}): Promise<{ ok: true } | { error: string }> {
  if (!supabase) return { error: "Supabase not configured" };
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return { error: "Not signed in" };

  const res = await fetch(`${appUrl}/api/inbox/send`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      contactId: input.contactId,
      channel: "sms",
      body: input.body,
      phone: input.phone,
    }),
  });

  let json: { ok?: boolean; error?: string } = {};
  try {
    json = (await res.json()) as { ok?: boolean; error?: string };
  } catch {
    return { error: `Request failed (${res.status})` };
  }
  if (!res.ok || json.error) {
    return { error: json.error ?? `Request failed (${res.status})` };
  }
  return { ok: true };
}
