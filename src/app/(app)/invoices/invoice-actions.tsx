"use client";

import { useTransition } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { sendInvoice, recordManualPayment } from "./actions";

export function InvoiceActions({
  invoiceId,
  publicToken,
  remaining,
}: {
  invoiceId: string;
  publicToken: string;
  remaining: number;
}) {
  const [pending, start] = useTransition();
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      <Button
        size="sm"
        variant="secondary"
        disabled={pending}
        onClick={() =>
          start(() => {
            void sendInvoice(invoiceId);
          })
        }
      >
        Send
      </Button>
      <Button
        size="sm"
        disabled={pending || remaining <= 0}
        onClick={() =>
          start(() => {
            void recordManualPayment({
              invoiceId,
              amount: remaining,
              method: "cash",
            });
          })
        }
      >
        Record cash
      </Button>
      <Link
        href={`/pay/${publicToken}`}
        className="self-center text-xs text-copper underline-offset-2 hover:underline"
        target="_blank"
        rel="noreferrer"
      >
        Open pay page
      </Link>
    </div>
  );
}
