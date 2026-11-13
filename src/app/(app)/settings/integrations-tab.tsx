"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { cancelIntegrationRequest, requestIntegration } from "./integrations-actions";

export type IntegrationCard = {
  id: string;
  name: string;
  description: string;
  /** Whether the platform has approved Sitewyre's API access yet. */
  approved: boolean;
  status: "disconnected" | "requested" | "connected";
  requestedAt: string | null;
};

export function IntegrationsTab({ canEdit, cards }: { canEdit: boolean; cards: IntegrationCard[] }) {
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function run(action: typeof requestIntegration, provider: string) {
    setMessage(null);
    start(async () => {
      const fd = new FormData();
      fd.set("provider", provider);
      const result = await action(fd);
      if ("error" in result) setMessage(result.error);
      else window.location.reload();
    });
  }

  return (
    <div className="space-y-4">
      {!canEdit ? (
        <p className="rounded-lg bg-charcoal/5 px-3 py-2 text-xs text-charcoal/60">
          View only — only the business owner or an admin can request a
          connection.
        </p>
      ) : null}

      <p className="text-sm text-charcoal/70">
        Connect your ad accounts and listings so their leads and results show
        up here. Each platform has to approve access first; you can ask to be
        connected now and we&apos;ll set it up as soon as it&apos;s approved.
      </p>

      {cards.map((card) => (
        <div key={card.id} className="rounded-lg border border-charcoal/10 bg-white p-3 text-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-medium">{card.name}</p>
              <p className="mt-1 text-xs text-charcoal/60">{card.description}</p>
            </div>
            <span
              className={
                card.status === "connected"
                  ? "shrink-0 rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-medium text-green-800"
                  : card.approved
                    ? "shrink-0 rounded-full bg-charcoal/10 px-2 py-0.5 text-[11px] font-medium text-charcoal/70"
                    : "shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800"
              }
            >
              {card.status === "connected" ? "Connected" : card.approved ? "Not connected" : "Pending approval"}
            </span>
          </div>

          {card.status === "requested" ? (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <p className="text-xs text-charcoal/70">
                Connection requested
                {card.requestedAt ? ` on ${new Date(card.requestedAt).toLocaleDateString()}` : ""}. We&apos;ll be
                in touch to set it up.
              </p>
              {canEdit ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  onClick={() => run(cancelIntegrationRequest, card.id)}
                >
                  Cancel request
                </Button>
              ) : null}
            </div>
          ) : card.status === "disconnected" && canEdit ? (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="mt-3"
              disabled={pending}
              onClick={() => run(requestIntegration, card.id)}
            >
              Request connection
            </Button>
          ) : null}
        </div>
      ))}

      {message ? <p className="text-sm text-red-600">{message}</p> : null}
    </div>
  );
}
