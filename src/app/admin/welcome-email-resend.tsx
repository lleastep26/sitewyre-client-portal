"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { resendWelcomeEmail } from "./actions";

export function WelcomeEmailResend({ clientId }: { clientId: string }) {
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function resend() {
    setMessage(null);
    start(async () => {
      const fd = new FormData();
      fd.set("clientId", clientId);
      const result = await resendWelcomeEmail(fd);
      setMessage("error" in result ? result.error : "Welcome email sent.");
    });
  }

  return (
    <div className="mt-2 flex items-center gap-2 text-xs">
      <Button type="button" size="sm" variant="outline" disabled={pending} onClick={resend}>
        {pending ? "…" : "Resend welcome email"}
      </Button>
      {message ? <span className="text-charcoal/60">{message}</span> : null}
    </div>
  );
}
