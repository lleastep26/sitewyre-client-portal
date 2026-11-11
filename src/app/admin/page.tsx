import { cookies } from "next/headers";
import { ADMIN_VIEW_COOKIE, requireAdmin } from "@/lib/auth/session";
import { switchAdminViewClient } from "./actions";
import { CallRoutingForm } from "./call-routing-form";
import { A2pStatusSelect } from "./a2p-status-select";
import { NumberPurchase } from "./number-purchase";

export default async function AdminPage() {
  const { supabase } = await requireAdmin();

  const cookieStore = await cookies();
  const currentClientId = cookieStore.get(ADMIN_VIEW_COOKIE)?.value;

  const { data: clients, error } = await supabase
    .from("clients")
    .select(
      "id, business_name, twilio_phone_number, a2p_status, plan, status, forward_to_phone, dial_timeout_seconds, phone",
    )
    .order("business_name", { ascending: true });

  return (
    <div className="mx-auto min-h-dvh w-full max-w-lg px-4 pb-12 pt-6">
      <header>
        <p className="text-xs uppercase tracking-[0.2em] text-copper">
          Sitewyre admin
        </p>
        <h1 className="mt-1 font-display text-2xl">All clients</h1>
      </header>

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

              <div className="mt-2">
                <A2pStatusSelect clientId={c.id} status={c.a2p_status} />
              </div>
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
              {!c.twilio_phone_number ? <NumberPurchase clientId={c.id} /> : null}
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
