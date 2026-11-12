"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { linkStripeCustomer, resendWelcomeEmail } from "./actions";

function statusLabel(status: string | null): { text: string; className: string } {
  switch (status) {
    case "active":
      return { text: "Active", className: "text-copper" };
    case "past_due":
      return { text: "Past due", className: "text-amber-700" };
    case "canceled":
    case "unpaid":
    case "incomplete_expired":
      return { text: "Cancelled", className: "text-red-600" };
    case "trialing":
      return { text: "Trialing", className: "text-amber-700" };
    default:
      return { text: status ?? "Not linked", className: "text-charcoal/50" };
  }
}

export function StripeLink({
  clientId,
  stripeCustomerId,
  billingStatus,
}: {
  clientId: string;
  stripeCustomerId: string | null;
  billingStatus: string | null;
}) {
  const [customerId, setCustomerId] = useState(stripeCustomerId ?? "");
  const [status, setStatus] = useState(billingStatus);
  const [plan, setPlan] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [welcomeMessage, setWelcomeMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [welcomePending, startWelcome] = useTransition();

  function link() {
    setError(null);
    start(async () => {
      const fd = new FormData();
      fd.set("clientId", clientId);
      fd.set("customerId", customerId);
      const result = await linkStripeCustomer(fd);
      if ("error" in result) setError(result.error);
      else {
        setStatus(result.status);
        setPlan(result.plan);
      }
    });
  }

  function resendWelcome() {
    setWelcomeMessage(null);
    startWelcome(async () => {
      const fd = new FormData();
      fd.set("clientId", clientId);
      const result = await resendWelcomeEmail(fd);
      setWelcomeMessage("error" in result ? result.error : "Welcome email sent.");
    });
  }

  const linked = Boolean(stripeCustomerId || status);
  const label = statusLabel(status);

  return (
    <div className="mt-2 space-y-1.5 text-xs">
      <div className="flex gap-2">
        <input
          value={customerId}
          onChange={(e) => setCustomerId(e.target.value.trim())}
          placeholder="cus_..."
          className="min-w-0 flex-1 rounded-md border border-charcoal/15 px-2 py-1"
        />
        <Button type="button" size="sm" variant="secondary" disabled={pending} onClick={link}>
          {pending ? "…" : linked ? "Re-check" : "Link"}
        </Button>
      </div>
      {error ? <p className="text-red-600">{error}</p> : null}
      {linked ? (
        <p className={label.className}>
          {plan ? `${plan} · ` : ""}
          {label.text}
        </p>
      ) : null}
      <div className="flex items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={welcomePending}
          onClick={resendWelcome}
        >
          {welcomePending ? "…" : "Resend welcome email"}
        </Button>
        {welcomeMessage ? <span className="text-charcoal/60">{welcomeMessage}</span> : null}
      </div>
    </div>
  );
}
