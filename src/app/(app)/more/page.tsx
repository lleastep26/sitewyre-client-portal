import Link from "next/link";
import { requireMembership } from "@/lib/auth/session";

const links = [
  { href: "/quotes", label: "Quotes" },
  { href: "/invoices", label: "Invoices" },
  { href: "/reports", label: "Reports" },
  { href: "/automations", label: "Automations" },
  { href: "/review-blast", label: "Review blast" },
  { href: "/results", label: "Results" },
  { href: "/settings", label: "Settings" },
  { href: "/help", label: "Help" },
  { href: "/crew", label: "Crew mode" },
];

export default async function MorePage() {
  const { role } = await requireMembership();
  const items =
    role === "sitewyre_admin"
      ? [...links, { href: "/admin", label: "Admin — all clients" }]
      : links;

  return (
    <div className="space-y-4 px-4">
      <header>
        <p className="text-xs uppercase tracking-[0.2em] text-copper">More</p>
        <h1 className="mt-1 font-display text-3xl">Menu</h1>
      </header>
      <ul className="overflow-hidden rounded-xl border border-charcoal/10 bg-white">
        {items.map((l) => (
          <li key={l.href} className="border-b border-charcoal/5 last:border-0">
            <Link href={l.href} className="block px-4 py-3.5 text-sm">
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
