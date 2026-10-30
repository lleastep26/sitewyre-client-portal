import Link from "next/link";
import { requireMembership } from "@/lib/auth/session";
import { createInvoice } from "./actions";
import { InvoiceActions } from "./invoice-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ new?: string; from_job?: string }>;
}) {
  const params = await searchParams;
  const { supabase, client } = await requireMembership();
  if (!client) return null;

  const { data: invoices } = await supabase
    .from("invoices")
    .select("*")
    .eq("client_id", client.id)
    .order("created_at", { ascending: false });

  return (
    <div className="space-y-4 px-4">
      <header>
        <p className="text-xs uppercase tracking-[0.2em] text-copper">Invoices</p>
        <h1 className="mt-1 font-display text-3xl">Payments</h1>
      </header>

      {params.new || params.from_job ? (
        <form action={async (fd) => { await createInvoice(fd); }} className="space-y-2 rounded-xl border bg-white p-4">
          {params.from_job ? (
            <input type="hidden" name="job_id" value={params.from_job} />
          ) : null}
          <Input name="total" type="number" step="0.01" placeholder="Total" required />
          <Button type="submit" className="w-full">
            Create invoice
          </Button>
        </form>
      ) : null}

      <ul className="space-y-2">
        {(invoices ?? []).map((inv) => {
          const remaining = Number(inv.total) - Number(inv.amount_paid);
          return (
            <li key={inv.id} className="rounded-lg border bg-white p-3">
              <p className="font-medium">
                {inv.number} · ${Number(inv.total).toLocaleString()}
              </p>
              <p className="text-xs text-charcoal/60">
                Paid ${Number(inv.amount_paid).toLocaleString()} · {inv.status}
              </p>
              <InvoiceActions
                invoiceId={inv.id}
                publicToken={inv.public_token}
                remaining={remaining}
              />
            </li>
          );
        })}
        {!invoices?.length ? (
          <div className="rounded-xl border border-dashed p-6 text-center">
            <p className="font-display text-xl">No invoices</p>
            <Link href="/invoices?new=1" className="mt-3 inline-block text-sm text-copper">
              Create invoice →
            </Link>
          </div>
        ) : null}
      </ul>
    </div>
  );
}
