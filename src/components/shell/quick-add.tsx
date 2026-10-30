"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

const actions = [
  { href: "/leads?new=1", label: "Lead" },
  { href: "/calendar?new=1", label: "Appointment" },
  { href: "/jobs?new=1", label: "Job" },
  { href: "/quotes?new=1", label: "Quote" },
  { href: "/invoices?new=1", label: "Invoice" },
];

export function QuickAdd() {
  const [open, setOpen] = useState(false);
  return (
    <div className="fixed bottom-20 right-4 z-50">
      {open ? (
        <div className="mb-2 w-44 overflow-hidden rounded-xl border border-charcoal/10 bg-white shadow-lg">
          {actions.map((a) => (
            <Link
              key={a.href}
              href={a.href}
              className="block px-4 py-3 text-sm text-charcoal hover:bg-charcoal/5"
              onClick={() => setOpen(false)}
            >
              Add {a.label}
            </Link>
          ))}
        </div>
      ) : null}
      <Button
        size="icon"
        className="h-14 w-14 rounded-full shadow-lg"
        onClick={() => setOpen((v) => !v)}
        aria-label="Quick add"
      >
        <Plus className="h-6 w-6" />
      </Button>
    </div>
  );
}
