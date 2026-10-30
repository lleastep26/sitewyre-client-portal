import Link from "next/link";

const links = [
  { href: "/quotes", label: "Quotes" },
  { href: "/invoices", label: "Invoices" },
  { href: "/reports", label: "Reports" },
  { href: "/automations", label: "Automations" },
  { href: "/settings", label: "Settings" },
  { href: "/help", label: "Help" },
  { href: "/crew", label: "Crew mode" },
];

export default function MorePage() {
  return (
    <div className="space-y-4 px-4">
      <header>
        <p className="text-xs uppercase tracking-[0.2em] text-copper">More</p>
        <h1 className="mt-1 font-display text-3xl">Menu</h1>
      </header>
      <ul className="overflow-hidden rounded-xl border border-charcoal/10 bg-white">
        {links.map((l) => (
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
