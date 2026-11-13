"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { reactivateOldLeads } from "./actions";

export function ReactivateOldLeadsButton() {
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function run() {
    const confirmed = window.confirm(
      "Text every open lead older than 30 days that hasn't been texted in 90 days? They'll be paced at up to 40/day, 9am-7pm.",
    );
    if (!confirmed) return;
    setMessage(null);
    start(async () => {
      const result = await reactivateOldLeads();
      if ("error" in result) setMessage(result.error);
      else {
        setMessage(
          result.scheduled
            ? `Scheduled ${result.scheduled} lead${result.scheduled === 1 ? "" : "s"}${result.skipped ? ` (${result.skipped} skipped — opted out)` : ""}.`
            : "No leads matched — nothing to send.",
        );
      }
    });
  }

  return (
    <div className="px-4">
      <Button type="button" variant="secondary" disabled={pending} onClick={run}>
        {pending ? "Scheduling…" : "Reactivate old leads"}
      </Button>
      {message ? <p className="mt-1 text-xs text-charcoal/60">{message}</p> : null}
    </div>
  );
}
