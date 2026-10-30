"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";

export function ConnectStripeButton({ connected }: { connected: boolean }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="space-y-2">
      <Button
        type="button"
        className="w-full"
        variant="secondary"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError(null);
            try {
              const res = await fetch("/api/stripe/connect", { method: "POST" });
              const text = await res.text();
              let data: { url?: string; error?: string } = {};
              if (text) {
                try {
                  data = JSON.parse(text) as { url?: string; error?: string };
                } catch {
                  setError(
                    res.ok
                      ? "Unexpected response from Stripe Connect"
                      : `Connect failed (${res.status})`,
                  );
                  return;
                }
              } else if (!res.ok) {
                setError(`Connect failed (${res.status})`);
                return;
              }

              if (data.url) {
                window.location.href = data.url;
                return;
              }
              setError(data.error ?? "Unable to start Connect");
            } catch (e) {
              setError(e instanceof Error ? e.message : "Unable to start Connect");
            }
          })
        }
      >
        {pending
          ? "Opening…"
          : connected
            ? "Open Connect onboarding"
            : "Connect Stripe"}
      </Button>
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
    </div>
  );
}
