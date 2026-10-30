import { createClient } from "@/lib/supabase/server";
import { getPaymentsProvider } from "@/lib/adapters";
import { getAppUrl } from "@/lib/supabase/env";
import type { ClientRow, MembershipRow } from "@/lib/supabase/types";

export async function POST() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return Response.json({ error: "Sign in required" }, { status: 401 });
    }

    const { data: memberships } = await supabase
      .from("memberships")
      .select("*")
      .eq("user_id", user.id);
    const list = (memberships ?? []) as MembershipRow[];
    const isAdmin = list.some((m) => m.role === "sitewyre_admin");
    const membership =
      list.find((m) => m.role !== "sitewyre_admin") ?? list[0];

    let client: ClientRow | null = null;
    if (membership) {
      const { data } = await supabase
        .from("clients")
        .select("*")
        .eq("id", membership.client_id)
        .maybeSingle();
      client = data;
    } else {
      const { data } = await supabase
        .from("clients")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();
      client = data;
    }
    if (!client && isAdmin) {
      const { data } = await supabase
        .from("clients")
        .select("*")
        .limit(1)
        .maybeSingle();
      client = data;
    }
    if (!client) {
      return Response.json({ error: "No business linked" }, { status: 400 });
    }

    if (!process.env.STRIPE_SECRET_KEY) {
      return Response.json(
        { error: "Stripe is not configured (STRIPE_SECRET_KEY missing)" },
        { status: 500 },
      );
    }

    const payments = getPaymentsProvider();
    let accountId = client.stripe_connect_account_id;
    if (!accountId) {
      const created = await payments.createConnectAccount(
        user.email ?? "owner@example.com",
        client.business_name ?? "Contractor",
      );
      accountId = created.accountId;
      const { error: updateError } = await supabase
        .from("clients")
        .update({ stripe_connect_account_id: accountId })
        .eq("id", client.id);
      if (updateError) {
        return Response.json({ error: updateError.message }, { status: 500 });
      }
    }

    const appUrl = getAppUrl();
    const link = await payments.createAccountLink(
      accountId,
      `${appUrl}/settings?stripe=refresh`,
      `${appUrl}/settings?stripe=return`,
    );

    return Response.json({ url: link.url });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Unable to start Stripe Connect";
    console.error("stripe/connect", err);
    return Response.json({ error: message }, { status: 500 });
  }
}
