"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";

export function ConnectStripeButton({ connected }: { connected: boolean }) {
  const [pending, start] = useTransition();
  return (
    <Button
      type="button"
      className="w-full"
      variant="secondary"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const res = await fetch("/api/stripe/connect", { method: "POST" });
          const data = await res.json();
          if (data.url) window.location.href = data.url;
          else alert(data.error ?? "Unable to start Connect");
        })
      }
    >
      {pending
        ? "Opening…"
        : connected
          ? "Open Connect onboarding"
          : "Connect Stripe"}
    </Button>
  );
}
