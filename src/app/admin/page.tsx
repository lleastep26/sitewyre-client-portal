import { cookies } from "next/headers";
import { ADMIN_VIEW_COOKIE, requireAgencyOrSitewyreAdmin } from "@/lib/auth/session";
import { switchAdminViewClient } from "./actions";
import { CallRoutingForm } from "./call-routing-form";
import { A2pStatusSelect } from "./a2p-status-select";
import { NumberPurchase } from "./number-purchase";
import { StripeLink } from "./stripe-link";
import { WelcomeEmailResend } from "./welcome-email-resend";
import { AddClientForm } from "./add-client-form";
import { AD_PROVIDERS } from "@/lib/integrations/ads";

export default async function AdminPage() {
  const { supabase, isSitewyreAdmin, agencyId } = await requireAgencyOrSitewyreAdmin();

  const cookieStore = await cookies();
  const currentClientId = cookieStore.get(ADMIN_VIEW_COOKIE)?.value;

  let query = supabase
    .from("clients")
    .select(
      "id, business_name, domain, twilio_phone_number, a2p_status, plan, status, forward_to_phone, dial_timeout_seconds, phone, stripe_customer_id, billing_status, ai_receptionist_enabled, retell_minutes_used_this_month, retell_minutes_allowance, ai_text_assistant_enabled, ai_text_replies_used_this_month, ai_text_replies_allowance, chat_widget_enabled, ai_chat_replies_used_this_month",
    )
    .order("business_name", { ascending: true });
  if (agencyId) query = query.eq("agency_id", agencyId);
  const { data: clients, error } = await query;

  // Connection requests from Settings → Integrations, so they can be set
  // up once each platform approves API access.
  const { data: integrationRequests } = await supabase
    .from("integrations")
    .select("client_id, provider")
    .eq("status", "requested");
  const requestedByClient = new Map<string, string[]>();
  for (const row of integrationRequests ?? []) {
    const name = AD_PROVIDERS.find((p) => p.id === row.provider)?.name ?? row.provider;
    requestedByClient.set(row.client_id, [...(requestedByClient.get(row.client_id) ?? []), name]);
  }

  return (
    <div className="mx-auto min-h-dvh w-full max-w-lg px-4 pb-12 pt-6">
      <header>
        <p className="text-xs uppercase tracking-[0.2em] text-copper">
          {isSitewyreAdmin ? "Sitewyre admin" : "Agency admin"}
        </p>
        <h1 className="mt-1 font-display text-2xl">All clients</h1>
      </header>

      <div className="mt-4">
        <AddClientForm />
      </div>

      {error ? (
        <p className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          Couldn&apos;t load clients: {error.message}
        </p>
      ) : null}

      <ul className="mt-4 space-y-2">
        {(clients ?? []).map((c) => {
          const isCurrent = c.id === currentClientId;
          return (
            <li
              key={c.id}
              className="rounded-xl border border-charcoal/10 bg-white p-3"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-medium">
                    {c.business_name ?? "(unnamed client)"}
                  </p>
                  <p className="truncate text-xs text-charcoal/60">
                    {c.twilio_phone_number ?? "no Twilio number"} · A2P:{" "}
                    {c.a2p_status ?? "pending"} · {c.plan ?? "—"} ·{" "}
                    {c.status ?? "—"}
                  </p>
                </div>
                <form action={switchAdminViewClient}>
                  <input type="hidden" name="clientId" value={c.id} />
                  <button
                    type="submit"
                    className={
                      isCurrent
                        ? "shrink-0 rounded-lg bg-copper px-3 py-1.5 text-xs font-medium text-white"
                        : "shrink-0 rounded-lg border border-charcoal/20 px-3 py-1.5 text-xs font-medium"
                    }
                  >
                    {isCurrent ? "Viewing" : "View as"}
                  </button>
                </form>
              </div>

              <p className={c.domain ? "mt-1 text-xs text-charcoal/50" : "mt-1 text-xs text-red-600"}>
                {c.domain
                  ? `Website: ${c.domain}`
                  : "No website domain saved — website forms and the chat widget can't find this client. Add it in Settings → Business Profile."}
              </p>
              {isSitewyreAdmin ? (
                <div className="mt-2">
                  <A2pStatusSelect clientId={c.id} status={c.a2p_status} />
                </div>
              ) : null}
              {c.a2p_status !== "approved" ? (
                <p className="mt-1 text-xs text-red-600">
                  Texting is blocked (A2P status: {c.a2p_status ?? "pending"})
                  {c.phone
                    ? ` — except contractor alerts to ${c.phone}`
                    : ""}
                  .
                </p>
              ) : null}
              <CallRoutingForm
                clientId={c.id}
                forwardPhone={c.forward_to_phone}
                dialTimeoutSeconds={c.dial_timeout_seconds}
              />
              {c.ai_receptionist_enabled ? (
                <p
                  className={
                    c.retell_minutes_used_this_month > c.retell_minutes_allowance
                      ? "mt-1 text-xs text-red-600"
                      : "mt-1 text-xs text-charcoal/50"
                  }
                >
                  AI receptionist: {c.retell_minutes_used_this_month.toFixed(1)} /{" "}
                  {c.retell_minutes_allowance.toFixed(0)} min this month
                  {c.retell_minutes_used_this_month > c.retell_minutes_allowance
                    ? " — over allowance, bill manually"
                    : ""}
                </p>
              ) : null}
              {c.ai_text_assistant_enabled ? (
                <p
                  className={
                    c.ai_text_replies_used_this_month > c.ai_text_replies_allowance
                      ? "mt-1 text-xs text-red-600"
                      : "mt-1 text-xs text-charcoal/50"
                  }
                >
                  AI text assistant: {c.ai_text_replies_used_this_month} /{" "}
                  {c.ai_text_replies_allowance} replies this month
                  {c.ai_text_replies_used_this_month > c.ai_text_replies_allowance
                    ? " — over allowance, bill manually"
                    : ""}
                </p>
              ) : null}
              {requestedByClient.has(c.id) ? (
                <p className="mt-1 text-xs text-copper">
                  Wants connecting: {requestedByClient.get(c.id)!.join(", ")}
                </p>
              ) : null}
              {c.chat_widget_enabled ? (
                <p className="mt-1 text-xs text-charcoal/50">
                  Website chat: {c.ai_chat_replies_used_this_month} AI replies this month
                </p>
              ) : null}
              {isSitewyreAdmin ? (
                <>
                  {!c.twilio_phone_number ? <NumberPurchase clientId={c.id} /> : null}
                  <StripeLink
                    clientId={c.id}
                    stripeCustomerId={c.stripe_customer_id}
                    billingStatus={c.billing_status}
                  />
                </>
              ) : null}
              <WelcomeEmailResend clientId={c.id} />
            </li>
          );
        })}
      </ul>

      {!error && !clients?.length ? (
        <p className="mt-6 text-sm text-charcoal/60">No clients yet.</p>
      ) : null}
    </div>
  );
}
