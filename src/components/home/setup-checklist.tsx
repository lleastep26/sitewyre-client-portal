import Link from "next/link";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";

const ITEMS = [
  { key: "verify_phone", label: "Verify phone number", href: "/settings" },
  { key: "test_form", label: "Test website form", href: "/leads" },
  { key: "add_services", label: "Add services and prices", href: "/settings" },
  { key: "connect_stripe", label: "Connect Stripe payouts", href: "/settings" },
  { key: "google_review", label: "Add Google review link", href: "/settings" },
  { key: "invite_crew", label: "Invite crew", href: "/settings" },
] as const;

export function SetupChecklist({
  checklist,
}: {
  checklist: Record<string, boolean> | null;
}) {
  const remaining = ITEMS.filter((i) => !checklist?.[i.key]);
  if (!remaining.length) return null;

  return (
    <Card>
      <CardTitle>Setup checklist</CardTitle>
      <CardDescription className="mt-1">
        Finish these so the portal works on day one.
      </CardDescription>
      <ul className="mt-3 space-y-2">
        {remaining.map((item) => (
          <li key={item.key}>
            <Link
              href={item.href}
              className="flex items-center justify-between rounded-md bg-charcoal/5 px-3 py-2 text-sm"
            >
              <span>{item.label}</span>
              <span className="text-copper">Start</span>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}
