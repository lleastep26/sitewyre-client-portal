"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  setAiTextAssistantEnabled,
  setAiTextRepliesAllowance,
} from "./ai-text-assistant-actions";

export function AiTextAssistantCard({
  canEdit,
  isAdmin,
  enabled,
  repliesUsedThisMonth,
  repliesAllowance,
}: {
  canEdit: boolean;
  isAdmin: boolean;
  enabled: boolean;
  repliesUsedThisMonth: number;
  repliesAllowance: number;
}) {
  const [message, setMessage] = useState<string | null>(null);
  const [allowance, setAllowance] = useState(String(repliesAllowance));
  const [pending, start] = useTransition();

  function toggleEnabled() {
    setMessage(null);
    start(async () => {
      const fd = new FormData();
      fd.set("enabled", String(!enabled));
      const result = await setAiTextAssistantEnabled(fd);
      if ("error" in result) setMessage(result.error);
      else window.location.reload();
    });
  }

  function saveAllowance() {
    setMessage(null);
    start(async () => {
      const fd = new FormData();
      fd.set("aiTextRepliesAllowance", allowance);
      const result = await setAiTextRepliesAllowance(fd);
      if ("error" in result) setMessage(result.error);
      else setMessage("Saved.");
    });
  }

  const overAllowance = repliesUsedThisMonth > repliesAllowance;

  return (
    <div className="space-y-4">
      {!canEdit ? (
        <p className="rounded-lg bg-charcoal/5 px-3 py-2 text-xs text-charcoal/60">
          View only — only the business owner or a Sitewyre admin can change
          these settings.
        </p>
      ) : null}

      <p className="text-sm text-charcoal/70">
        Answers leads who text back, using your Business knowledge, and books
        them when it can. It hands the thread to you if it doesn&apos;t know
        the answer, the customer is upset, asks for a person, or mentions an
        emergency. You can take over any thread from the inbox.
      </p>

      <div className="flex items-center justify-between rounded-lg border border-charcoal/10 bg-white p-3">
        <div>
          <p className="text-sm font-medium">AI text assistant</p>
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
        <p className="font-medium">AI replies sent this month</p>
        <p className={overAllowance ? "mt-1 text-red-600" : "mt-1 text-charcoal/70"}>
          {repliesUsedThisMonth} / {repliesAllowance}
          {overAllowance ? " — over allowance" : ""}
        </p>
        {isAdmin ? (
          <div className="mt-3 flex items-end gap-2">
            <div>
              <Label htmlFor="aiTextRepliesAllowance">Monthly allowance (admin)</Label>
              <Input
                id="aiTextRepliesAllowance"
                value={allowance}
                onChange={(e) => setAllowance(e.target.value)}
                className="mt-1 w-28"
              />
            </div>
            <Button type="button" size="sm" disabled={pending} onClick={saveAllowance}>
              Save
            </Button>
          </div>
        ) : null}
      </div>

      {message ? <p className="text-sm text-red-600">{message}</p> : null}
    </div>
  );
}
