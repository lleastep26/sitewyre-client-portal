"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { setClientCallRouting } from "./actions";

export function CallRoutingForm({
  clientId,
  forwardPhone,
  dialTimeoutSeconds,
}: {
  clientId: string;
  forwardPhone: string | null;
  dialTimeoutSeconds: number;
}) {
  const [forward, setForward] = useState(forwardPhone ?? "");
  const [timeout, setTimeoutSeconds] = useState(String(dialTimeoutSeconds));
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();

  function save() {
    setError(null);
    setSaved(false);
    start(async () => {
      const fd = new FormData();
      fd.set("clientId", clientId);
      fd.set("forwardPhone", forward);
      fd.set("dialTimeoutSeconds", timeout);
      const result = await setClientCallRouting(fd);
      if ("error" in result) setError(result.error);
      else setSaved(true);
    });
  }

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
      <input
        value={forward}
        onChange={(e) => setForward(e.target.value)}
        placeholder="Forward-to phone"
        className="w-32 rounded-md border border-charcoal/15 px-2 py-1"
      />
      <input
        value={timeout}
        onChange={(e) => setTimeoutSeconds(e.target.value)}
        placeholder="Dial timeout (s)"
        inputMode="numeric"
        className="w-24 rounded-md border border-charcoal/15 px-2 py-1"
      />
      <Button type="button" size="sm" variant="secondary" disabled={pending} onClick={save}>
        {pending ? "…" : "Save"}
      </Button>
      {saved ? <span className="text-copper">Saved</span> : null}
      {error ? <span className="text-red-600">{error}</span> : null}
    </div>
  );
}
