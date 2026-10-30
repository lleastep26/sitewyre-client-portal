"use client";

import { useTransition } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { sendQuote, convertQuoteToJob } from "./actions";

export function QuoteActions({
  quoteId,
  publicToken,
}: {
  quoteId: string;
  publicToken: string;
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
            void sendQuote(quoteId);
          })
        }
      >
        Send
      </Button>
      <Button
        size="sm"
        disabled={pending}
        onClick={() =>
          start(() => {
            void convertQuoteToJob(quoteId);
          })
        }
      >
        Create job
      </Button>
      <Link href={`/q/${publicToken}`} className="self-center text-xs text-copper">
        Public link
      </Link>
    </div>
  );
}
