"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { ADMIN_VIEW_COOKIE, requireAdmin } from "@/lib/auth/session";
import { getSmsProvider } from "@/lib/adapters";
import { getAppUrl } from "@/lib/supabase/env";
import { normalizePhone } from "@/lib/utils";

const A2P_STATUSES = ["pending", "approved", "failed"] as const;

export async function switchAdminViewClient(formData: FormData) {
  const { supabase, user } = await requireAdmin();
  const clientId = String(formData.get("clientId") ?? "").trim();
  if (!clientId) redirect("/admin");

  const { data: client } = await supabase
    .from("clients")
    .select("id")
    .eq("id", clientId)
    .maybeSingle();
  if (!client) redirect("/admin");

  const cookieStore = await cookies();
  cookieStore.set(ADMIN_VIEW_COOKIE, client.id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });

  await supabase.from("audit_log").insert({
    actor_id: user.id,
    action: "admin_view_as",
    entity: "client",
    entity_id: client.id,
    client_id: client.id,
  });

  redirect("/");
}

export async function clearAdminViewClient() {
  await requireAdmin();
  const cookieStore = await cookies();
  cookieStore.delete(ADMIN_VIEW_COOKIE);
  redirect("/admin");
}

async function getClientForNumberPurchase(
  supabase: Awaited<ReturnType<typeof requireAdmin>>["supabase"],
  clientId: string,
) {
  const { data: client } = await supabase
    .from("clients")
    .select("id, twilio_phone_number, forward_to_phone")
    .eq("id", clientId)
    .maybeSingle();
  if (!client) return { error: "Client not found" } as const;
  if (client.twilio_phone_number) {
    return { error: "This client already has a Twilio number assigned." } as const;
  }
  if (!client.forward_to_phone) {
    return {
      error: "Set a forward-to phone number for this client before buying a number.",
    } as const;
  }
  return { client } as const;
}

export async function previewClientNumber(formData: FormData) {
  const { supabase } = await requireAdmin();
  const clientId = String(formData.get("clientId") ?? "");
  const areaCode = String(formData.get("areaCode") ?? "").trim();
  if (!/^\d{3}$/.test(areaCode)) return { error: "Enter a 3-digit area code" };

  const guard = await getClientForNumberPurchase(supabase, clientId);
  if ("error" in guard) return { error: guard.error };

  const provider = getSmsProvider();
  const [phoneNumber, monthlyPrice] = await Promise.all([
    provider.searchLocalNumber(areaCode),
    provider.getLocalNumberMonthlyPrice(),
  ]);
  if (!phoneNumber) {
    return { error: `No numbers available for area code ${areaCode}` };
  }
  return { phoneNumber, monthlyPrice };
}

export async function buyClientNumber(formData: FormData) {
  const { supabase, user } = await requireAdmin();
  const clientId = String(formData.get("clientId") ?? "");
  const phoneNumber = String(formData.get("phoneNumber") ?? "").trim();
  if (!phoneNumber) return { error: "No number to buy" };

  // Re-check the guards at purchase time too — the preview could be stale
  // (another admin tab, a slow confirm) by the time this fires.
  const guard = await getClientForNumberPurchase(supabase, clientId);
  if ("error" in guard) return { error: guard.error };

  const provider = getSmsProvider();
  const purchased = await provider.buyNumber(phoneNumber);

  // Only the number just purchased here gets its webhooks set — this never
  // touches any client's pre-existing Twilio number.
  await provider.assignNumberWebhooks(purchased.sid, {
    smsUrl: `${getAppUrl()}/api/twilio/webhook`,
    voiceUrl: `${getAppUrl()}/api/twilio/voice`,
  });

  const { error } = await supabase
    .from("clients")
    .update({
      twilio_phone_number: purchased.phoneNumber,
      twilio_phone_sid: purchased.sid,
    })
    .eq("id", clientId);
  if (error) return { error: error.message };

  await supabase.from("audit_log").insert({
    actor_id: user.id,
    action: "admin_bought_twilio_number",
    entity: "client",
    entity_id: clientId,
    client_id: clientId,
    diff: { phoneNumber: purchased.phoneNumber, sid: purchased.sid },
  });

  revalidatePath("/admin");
  return { ok: true, phoneNumber: purchased.phoneNumber };
}

export async function setClientCallRouting(formData: FormData) {
  const { supabase } = await requireAdmin();
  const clientId = String(formData.get("clientId") ?? "");
  const forwardPhoneRaw = String(formData.get("forwardPhone") ?? "").trim();
  const dialTimeoutRaw = String(formData.get("dialTimeoutSeconds") ?? "").trim();

  const forwardPhone = forwardPhoneRaw ? normalizePhone(forwardPhoneRaw) : null;
  const dialTimeoutSeconds = dialTimeoutRaw ? Number(dialTimeoutRaw) : 15;
  if (
    !Number.isInteger(dialTimeoutSeconds) ||
    dialTimeoutSeconds < 5 ||
    dialTimeoutSeconds > 60
  ) {
    return { error: "Dial timeout must be a whole number of seconds, 5-60" };
  }

  const { error } = await supabase
    .from("clients")
    .update({ forward_to_phone: forwardPhone, dial_timeout_seconds: dialTimeoutSeconds })
    .eq("id", clientId);
  if (error) return { error: error.message };

  revalidatePath("/admin");
  return { ok: true };
}

export async function setClientA2pStatus(formData: FormData) {
  const { supabase } = await requireAdmin();
  const clientId = String(formData.get("clientId") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!A2P_STATUSES.includes(status as (typeof A2P_STATUSES)[number])) {
    return { error: "Invalid A2P status" };
  }

  const { error } = await supabase
    .from("clients")
    .update({ a2p_status: status })
    .eq("id", clientId);
  if (error) return { error: error.message };

  revalidatePath("/admin");
  return { ok: true };
}
