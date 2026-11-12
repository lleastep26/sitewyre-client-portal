"use server";

import Stripe from "stripe";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { ADMIN_VIEW_COOKIE, requireAdmin } from "@/lib/auth/session";
import { normalizePhone } from "@/lib/utils";
import { createAdminClient } from "@/lib/supabase/admin";
import { getEmailProvider } from "@/lib/adapters";
import { welcomeEmailHtml } from "@/lib/email/welcome";
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

export async function linkStripeCustomer(
  formData: FormData,
): Promise<{ ok: true; plan: string; status: string } | { error: string }> {
  const { supabase, user } = await requireAdmin();
  const clientId = String(formData.get("clientId") ?? "");
  const customerId = String(formData.get("customerId") ?? "").trim();
  if (!customerId.startsWith("cus_")) {
    return { error: "Enter a valid Stripe customer ID (starts with cus_)" };
  }

  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return { error: "Stripe is not configured" };
  const stripe = new Stripe(key);

  let customer: Stripe.Customer | Stripe.DeletedCustomer;
  try {
    customer = await stripe.customers.retrieve(customerId);
  } catch (err) {
    return { error: (err as Error).message };
  }
  if (customer.deleted) return { error: "That Stripe customer was deleted" };

  const subs = await stripe.subscriptions.list({
    customer: customerId,
    status: "all",
    limit: 1,
    expand: ["data.items.data.price.product"],
  });
  const sub = subs.data[0];
  if (!sub) return { error: "No subscription found for that customer" };

  const price = sub.items.data[0]?.price;
  const product = price?.product;
  const plan =
    (product && typeof product === "object" && "name" in product
      ? product.name
      : null) ??
    price?.nickname ??
    price?.id ??
    "Unknown plan";

  const { error } = await supabase
    .from("clients")
    .update({
      stripe_customer_id: customerId,
      stripe_subscription_id: sub.id,
      billing_status: sub.status,
    })
    .eq("id", clientId);
  if (error) return { error: error.message };

  await supabase.from("audit_log").insert({
    actor_id: user.id,
    action: "admin_linked_stripe_customer",
    entity: "client",
    entity_id: clientId,
    client_id: clientId,
    diff: { customerId, subscriptionId: sub.id, status: sub.status },
  });

  revalidatePath("/admin");
  return { ok: true, plan, status: sub.status };
}

export async function resendWelcomeEmail(
  formData: FormData,
): Promise<{ ok: true } | { error: string }> {
  const { supabase, user } = await requireAdmin();
  const clientId = String(formData.get("clientId") ?? "");

  const { data: client } = await supabase
    .from("clients")
    .select("id, business_name")
    .eq("id", clientId)
    .maybeSingle();
  if (!client) return { error: "Client not found" };

  const { data: membership } = await supabase
    .from("memberships")
    .select("user_id")
    .eq("client_id", clientId)
    .eq("role", "owner")
    .maybeSingle();
  if (!membership) return { error: "No owner found for this client" };

  const admin = createAdminClient();
  const { data: ownerUser, error: userErr } = await admin.auth.admin.getUserById(
    membership.user_id,
  );
  if (userErr || !ownerUser.user?.email) {
    return { error: "Owner has no email on file" };
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  try {
    await getEmailProvider().send({
      to: ownerUser.user.email,
      subject: "Your Sitewyre portal is ready",
      html: welcomeEmailHtml({
        businessName: client.business_name,
        loginUrl: `${appUrl}/login`,
      }),
    });
  } catch (err) {
    return { error: (err as Error).message };
  }

  await supabase.from("audit_log").insert({
    actor_id: user.id,
    action: "admin_resent_welcome_email",
    entity: "client",
    entity_id: clientId,
    client_id: clientId,
  });

  return { ok: true };
}
