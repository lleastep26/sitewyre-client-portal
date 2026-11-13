"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { setChatWidgetEnabled } from "./chat-widget-actions";

export function ChatWidgetCard({
  canEdit,
  enabled,
  snippet,
  allowedSite,
  repliesUsedThisMonth,
}: {
  canEdit: boolean;
  enabled: boolean;
  /** The script tag to paste, or null when the business has no site key. */
  snippet: string | null;
  allowedSite: string | null;
  repliesUsedThisMonth: number;
}) {
  const [message, setMessage] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();

  function toggleEnabled() {
    setMessage(null);
    start(async () => {
      const fd = new FormData();
      fd.set("enabled", String(!enabled));
      const result = await setChatWidgetEnabled(fd);
      if ("error" in result) setMessage(result.error);
      else window.location.reload();
    });
  }

  async function copySnippet() {
    if (!snippet) return;
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
    } catch {
      setMessage("Couldn't copy — select the code and copy it by hand.");
    }
  }

  return (
    <div className="space-y-4">
      {!canEdit ? (
        <p className="rounded-lg bg-charcoal/5 px-3 py-2 text-xs text-charcoal/60">
          View only — only the business owner or a Sitewyre admin can change
          these settings.
        </p>
      ) : null}

      <p className="text-sm text-charcoal/70">
        A chat bubble for your website. It takes the visitor&apos;s name, phone
        and what they need, creates the lead right away, then answers
        questions from your Business knowledge. It never quotes prices; if it
        isn&apos;t sure, it tells the visitor the team will follow up and
        alerts you.
      </p>

      <div className="flex items-center justify-between rounded-lg border border-charcoal/10 bg-white p-3">
        <div>
          <p className="text-sm font-medium">Chat widget</p>
          <p className="text-xs text-charcoal/50">{enabled ? "On" : "Off"}</p>
        </div>
        {canEdit ? (
          <Button
            type="button"
            size="sm"
            variant={enabled ? "outline" : "secondary"}
            disabled={pending}
            onClick={toggleEnabled}
          >
            {enabled ? "Turn off" : "Turn on"}
          </Button>
        ) : null}
      </div>

      <div className="rounded-lg border border-charcoal/10 bg-white p-3 text-sm">
        <p className="font-medium">Install</p>
        {snippet ? (
          <>
            <p className="mt-1 text-xs text-charcoal/60">
              Paste this just before the closing &lt;/body&gt; tag on every page
              of the site. It only works on{" "}
              {allowedSite ?? "the website saved in Business Profile"}, and
              shows nothing while the widget is off.
            </p>
            <pre className="mt-2 overflow-x-auto rounded-md bg-charcoal/5 p-2 text-[11px] leading-relaxed">
              <code>{snippet}</code>
            </pre>
            <Button type="button" size="sm" variant="outline" className="mt-2" onClick={copySnippet}>
              {copied ? "Copied" : "Copy code"}
            </Button>
          </>
        ) : (
          <p className="mt-1 text-xs text-charcoal/60">
            This business has no site key yet, so there is no code to install.
          </p>
        )}
      </div>

      <div className="rounded-lg border border-charcoal/10 bg-white p-3 text-sm">
        <p className="font-medium">AI chat replies this month</p>
        <p className="mt-1 text-charcoal/70">{repliesUsedThisMonth}</p>
      </div>

      {message ? <p className="text-sm text-red-600">{message}</p> : null}
    </div>
  );
}
