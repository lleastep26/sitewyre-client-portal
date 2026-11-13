"use server";

import { revalidatePath } from "next/cache";
import { requireMembership } from "@/lib/auth/session";
import { normalizePhone } from "@/lib/utils";
import {
  buyLocalNumberWithWebhooks,
  numberPurchaseBlockReason,
  previewLocalNumber,
} from "@/lib/phone/provision";

function canEditPhoneEmail(role: string): boolean {
  return role === "owner" || role === "sitewyre_admin";
}

/** Settable from this tab so the self-serve flow isn't blocked waiting on
 * an admin — the admin call-routing form on /admin still works too, same
 * column either way. */
export async function setOwnForwardPhone(
  formData: FormData,
): Promise<{ ok: true } | { error: string }> {
  const { supabase, client, role } = await requireMembership();
  if (!client) return { error: "No business is linked to this account." };
  if (!canEditPhoneEmail(role)) {
    return { error: "Only the owner or a Sitewyre admin can manage the phone number." };
  }

  const raw = String(formData.get("forwardPhone") ?? "").trim();
  if (!raw) return { error: "Enter a phone number to forward calls to" };
  const forwardPhone = normalizePhone(raw);

  const { error } = await supabase
    .from("clients")
    .update({ forward_to_phone: forwardPhone })
    .eq("id", client.id);
  if (error) return { error: error.message };

  revalidatePath("/settings");
  return { ok: true };
}

/**
 * "My business number forwards unanswered calls to Sitewyre." With it on,
 * every call to the Sitewyre number goes straight to the AI receptionist
 * (see src/lib/twilio/forwarded-calls.ts), so it needs the AI receptionist
 * to be on: a forwarded call can't ring the owner again without looping.
 */
export async function setCallForwarding(
  formData: FormData,
): Promise<{ ok: true } | { error: string }> {
  const { supabase, client, role } = await requireMembership();
  if (!client) return { error: "No business is linked to this account." };
  if (!canEditPhoneEmail(role)) {
    return { error: "Only the owner or a Sitewyre admin can manage the phone number." };
  }

  const enabled = formData.get("enabled") === "true";
  const raw = String(formData.get("businessLinePhone") ?? "").trim();
  const digits = raw.replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
  if (raw && digits.length !== 10) {
    return { error: "Enter your business number with its area code." };
  }
  const businessLinePhone = raw ? normalizePhone(digits) : null;

  if (enabled) {
    if (!client.twilio_phone_number) {
      return { error: "This business needs a Sitewyre number before calls can be forwarded to it." };
    }
    if (!client.ai_receptionist_enabled || !client.retell_agent_id) {
      return {
        error:
          "Turn on the AI receptionist first (AI assistants tab). Forwarded calls are answered by it.",
      };
    }
    if (!businessLinePhone) {
      return { error: "Enter the business number you're forwarding from." };
    }
    if (businessLinePhone === normalizePhone(client.twilio_phone_number)) {
      return { error: "That's your Sitewyre number. Enter your own business number." };
    }
  }

  const { error } = await supabase
    .from("clients")
    .update({ call_forwarding_enabled: enabled, business_line_phone: businessLinePhone })
    .eq("id", client.id);
  if (error) return { error: error.message };

  revalidatePath("/settings");
  return { ok: true };
}

export async function previewOwnNumber(
  formData: FormData,
): Promise<{ phoneNumber: string; monthlyPrice: string } | { error: string }> {
  const { client, role } = await requireMembership();
  if (!client) return { error: "No business is linked to this account." };
  if (!canEditPhoneEmail(role)) {
    return { error: "Only the owner or a Sitewyre admin can manage the phone number." };
  }
  const blockReason = numberPurchaseBlockReason(client);
  if (blockReason) return { error: blockReason };

  const areaCode = String(formData.get("areaCode") ?? "").trim();
  return previewLocalNumber(areaCode);
}

export async function buyOwnNumber(
  formData: FormData,
): Promise<{ ok: true; phoneNumber: string } | { error: string }> {
  const { supabase, client, role, user } = await requireMembership();
  if (!client) return { error: "No business is linked to this account." };
  if (!canEditPhoneEmail(role)) {
    return { error: "Only the owner or a Sitewyre admin can manage the phone number." };
  }
  const blockReason = numberPurchaseBlockReason(client);
  if (blockReason) return { error: blockReason };

  const phoneNumber = String(formData.get("phoneNumber") ?? "").trim();
  if (!phoneNumber) return { error: "No number to buy" };

  const purchased = await buyLocalNumberWithWebhooks(phoneNumber);

  const { error } = await supabase
    .from("clients")
    .update({
      twilio_phone_number: purchased.phoneNumber,
      twilio_phone_sid: purchased.sid,
    })
    .eq("id", client.id);
  if (error) return { error: error.message };

  await supabase.from("audit_log").insert({
    actor_id: user.id,
    action: "self_serve_bought_twilio_number",
    entity: "client",
    entity_id: client.id,
    client_id: client.id,
    diff: { phoneNumber: purchased.phoneNumber, sid: purchased.sid },
  });

  revalidatePath("/settings");
  return { ok: true, phoneNumber: purchased.phoneNumber };
}

/** Admin-only, deliberately not owner: the allowance is "set by admin,"
 * the client only ever sees usage against it. */
export async function setSmsMonthlyAllowance(
  formData: FormData,
): Promise<{ ok: true } | { error: string }> {
  const { supabase, client, role } = await requireMembership();
  if (!client) return { error: "No business is linked to this account." };
  if (role !== "sitewyre_admin") {
    return { error: "Only a Sitewyre admin can change the monthly allowance." };
  }

  const allowance = Number(formData.get("smsMonthlyAllowance") ?? "");
  if (!Number.isInteger(allowance) || allowance < 0 || allowance > 100_000) {
    return { error: "Allowance must be a whole number, 0-100,000" };
  }

  const { error } = await supabase
    .from("clients")
    .update({ sms_monthly_allowance: allowance })
    .eq("id", client.id);
  if (error) return { error: error.message };

  revalidatePath("/settings");
  return { ok: true };
}
