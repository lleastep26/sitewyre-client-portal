"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { ADMIN_VIEW_COOKIE, requireAdmin } from "@/lib/auth/session";
import { normalizePhone } from "@/lib/utils";
import {
  buyLocalNumberWithWebhooks,
  numberPurchaseBlockReason,
  previewLocalNumber,
} from "@/lib/phone/provision";

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
): Promise<
  | { error: string }
  | { client: { id: string; twilio_phone_number: string | null; forward_to_phone: string | null } }
> {
  const { data: client } = await supabase
    .from("clients")
    .select("id, twilio_phone_number, forward_to_phone")
    .eq("id", clientId)
    .maybeSingle();
  if (!client) return { error: "Client not found" };
  const blockReason = numberPurchaseBlockReason(client);
  if (blockReason) return { error: blockReason };
  return { client };
}

export async function previewClientNumber(
  formData: FormData,
): Promise<{ phoneNumber: string; monthlyPrice: string } | { error: string }> {
  const { supabase } = await requireAdmin();
  const clientId = String(formData.get("clientId") ?? "");
  const areaCode = String(formData.get("areaCode") ?? "").trim();

  const guard = await getClientForNumberPurchase(supabase, clientId);
  if ("error" in guard) return { error: guard.error };

  return previewLocalNumber(areaCode);
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

  const purchased = await buyLocalNumberWithWebhooks(phoneNumber);

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
