"use client";

import { useTransition } from "react";
import { setAutomationEnabled } from "./actions";

export function AutomationToggle({
  trigger,
  enabled,
}: {
  trigger: string;
  enabled: boolean;
}) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      className={`rounded-md px-2 py-1 text-xs uppercase tracking-wide ${
        enabled ? "bg-copper/15 text-copper" : "bg-charcoal/10 text-charcoal/50"
      }`}
      onClick={() =>
        start(() => {
          void setAutomationEnabled({ trigger, enabled: !enabled });
        })
      }
    >
      {pending ? "…" : enabled ? "On" : "Off"}
    </button>
  );
}
