import { cookies } from "next/headers";
import { ADMIN_VIEW_COOKIE, requireAdmin } from "@/lib/auth/session";
import { switchAdminViewClient } from "./actions";

export default async function AdminPage() {
  const { supabase } = await requireAdmin();

  const cookieStore = await cookies();
  const currentClientId = cookieStore.get(ADMIN_VIEW_COOKIE)?.value;

  const { data: clients } = await supabase
    .from("clients")
    .select("id, business_name, twilio_phone_number, a2p_status, plan, status")
    .order("business_name", { ascending: true });

  return (
    <div className="mx-auto min-h-dvh w-full max-w-lg px-4 pb-12 pt-6">
      <header>
        <p className="text-xs uppercase tracking-[0.2em] text-copper">
          Sitewyre admin
        </p>
        <h1 className="mt-1 font-display text-2xl">All clients</h1>
      </header>

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
            </li>
          );
        })}
      </ul>

      {!clients?.length ? (
        <p className="mt-6 text-sm text-charcoal/60">No clients yet.</p>
      ) : null}
    </div>
  );
}
