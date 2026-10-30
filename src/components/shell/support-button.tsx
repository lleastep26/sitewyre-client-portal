"use client";

import { useState, useTransition } from "react";
import { LifeBuoy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { createSupportTicket } from "@/app/(app)/support/actions";

export function SupportButton() {
  const [open, setOpen] = useState(false);
  const [urgent, setUrgent] = useState(false);
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();
  const [done, setDone] = useState<string | null>(null);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-20 left-4 z-50 inline-flex items-center gap-1 rounded-full border border-charcoal/15 bg-white px-3 py-2 text-xs text-charcoal shadow"
      >
        <LifeBuoy className="h-4 w-4 text-copper" />
        Get help
      </button>
    );
  }

  return (
    <div className="fixed inset-x-4 bottom-24 z-50 mx-auto max-w-md rounded-xl border border-charcoal/10 bg-white p-4 shadow-xl">
      <h3 className="font-display text-lg text-charcoal">Get help</h3>
      <p className="mt-1 text-sm text-charcoal/60">
        Message goes to the Sitewyre admin inbox.
      </p>
      <Textarea
        className="mt-3"
        value={msg}
        onChange={(e) => setMsg(e.target.value)}
        placeholder="What's going on?"
      />
      <label className="mt-3 flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={urgent}
          onChange={(e) => setUrgent(e.target.checked)}
        />
        Urgent (leads/texts broken — alert Mr. East by text)
      </label>
      {done ? <p className="mt-2 text-sm text-copper">{done}</p> : null}
      <div className="mt-3 flex gap-2">
        <Button variant="secondary" className="flex-1" onClick={() => setOpen(false)}>
          Cancel
        </Button>
        <Button
          className="flex-1"
          disabled={pending || !msg.trim()}
          onClick={() =>
            start(async () => {
              const res = await createSupportTicket({
                subject: urgent ? "URGENT support" : "Help request",
                body: msg,
                urgent,
              });
              setDone(res.error ?? "Sent — we'll follow up.");
              if (!res.error) {
                setMsg("");
                setUrgent(false);
              }
            })
          }
        >
          {pending ? "Sending…" : "Send"}
        </Button>
      </div>
    </div>
  );
}
