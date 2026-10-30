import { requireMembership } from "@/lib/auth/session";
import { getPaymentsProvider } from "@/lib/adapters";
import { getAppUrl } from "@/lib/supabase/env";

export async function POST() {
  const { supabase, client, user } = await requireMembership();
  if (!client) {
    return Response.json({ error: "No client" }, { status: 400 });
  }

  const payments = getPaymentsProvider();
  let accountId = client.stripe_connect_account_id;
  if (!accountId) {
    const created = await payments.createConnectAccount(
      user.email ?? "owner@example.com",
      client.business_name ?? "Contractor",
    );
    accountId = created.accountId;
    await supabase
      .from("clients")
      .update({ stripe_connect_account_id: accountId })
      .eq("id", client.id);
  }

  const appUrl = getAppUrl();
  const link = await payments.createAccountLink(
    accountId,
    `${appUrl}/settings?stripe=refresh`,
    `${appUrl}/settings?stripe=return`,
  );

  return Response.json({ url: link.url });
}
