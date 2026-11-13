"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { disconnectCalendar } from "./calendars-actions";

export function CalendarsTab({
  canEdit,
  connection,
  googleVerified,
}: {
  canEdit: boolean;
  connection: { provider: "google" | "outlook"; createdAt: string } | null;
  googleVerified: boolean;
}) {
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function disconnect() {
    const confirmed = window.confirm(
      "Disconnect this calendar? Busy-time checking and event sync will stop until you reconnect.",
    );
    if (!confirmed) return;
    setMessage(null);
    start(async () => {
      const result = await disconnectCalendar();
      if ("error" in result) setMessage(result.error);
      else window.location.reload();
    });
  }

  return (
    <div className="space-y-4">
      {!canEdit ? (
        <p className="rounded-lg bg-charcoal/5 px-3 py-2 text-xs text-charcoal/60">
          View only — only the business owner or a Sitewyre admin can
          connect or disconnect a calendar.
        </p>
      ) : null}

      <p className="text-sm text-charcoal/70">
        Connect a calendar so booked appointments show up there too, and so
        busy times on that calendar block new bookings. If nothing&apos;s
        connected, the portal&apos;s own calendar is used alone.
      </p>

      {connection ? (
        <div className="rounded-lg border border-charcoal/10 bg-white p-3 text-sm">
          <p className="font-medium">
            Connected: {connection.provider === "google" ? "Google Calendar" : "Outlook"}
          </p>
          <p className="mt-1 text-xs text-charcoal/50">
            Since {new Date(connection.createdAt).toLocaleDateString()}
          </p>
          {canEdit ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="mt-2"
              disabled={pending}
              onClick={disconnect}
            >
              Disconnect
            </Button>
          ) : null}
        </div>
      ) : canEdit ? (
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm" variant="secondary">
            <a href="/api/integrations/google/connect">Connect Google Calendar</a>
          </Button>
          <Button asChild size="sm" variant="secondary">
            <a href="/api/integrations/microsoft/connect">Connect Outlook</a>
          </Button>
        </div>
      ) : (
        <p className="text-sm text-charcoal/50">Not connected</p>
      )}

      {!googleVerified ? (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Google Calendar connection is in testing mode — only Google
          accounts added as test users on this app can connect until it&apos;s
          verified.
        </p>
      ) : null}

      {message ? <p className="text-sm text-red-600">{message}</p> : null}
    </div>
  );
}
