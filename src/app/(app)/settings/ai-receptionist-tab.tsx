"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  setAiReceptionistEnabled,
  setAiReceptionistBookingEnabled,
  setRetellMinutesAllowance,
} from "./ai-receptionist-actions";

export function AiReceptionistTab({
  canEdit,
  isAdmin,
  enabled,
  bookingEnabled,
  minutesUsedThisMonth,
  minutesAllowance,
}: {
  canEdit: boolean;
  isAdmin: boolean;
  enabled: boolean;
  bookingEnabled: boolean;
  minutesUsedThisMonth: number;
  minutesAllowance: number;
}) {
  const [message, setMessage] = useState<string | null>(null);
  const [allowance, setAllowance] = useState(String(minutesAllowance));
  const [pending, start] = useTransition();

  function toggleEnabled() {
    setMessage(null);
    start(async () => {
      const fd = new FormData();
      fd.set("enabled", String(!enabled));
      const result = await setAiReceptionistEnabled(fd);
      if ("error" in result) setMessage(result.error);
      else window.location.reload();
    });
  }

  function toggleBooking() {
    setMessage(null);
    start(async () => {
      const fd = new FormData();
      fd.set("bookingEnabled", String(!bookingEnabled));
      const result = await setAiReceptionistBookingEnabled(fd);
      if ("error" in result) setMessage(result.error);
      else window.location.reload();
    });
  }

  function saveAllowance() {
    setMessage(null);
    start(async () => {
      const fd = new FormData();
      fd.set("retellMinutesAllowance", allowance);
      const result = await setRetellMinutesAllowance(fd);
      if ("error" in result) setMessage(result.error);
      else setMessage("Saved.");
    });
  }

  const overAllowance = minutesUsedThisMonth > minutesAllowance;

  return (
    <div className="space-y-4">
      {!canEdit ? (
        <p className="rounded-lg bg-charcoal/5 px-3 py-2 text-xs text-charcoal/60">
          View only — only the business owner or a Sitewyre admin can change
          these settings.
        </p>
      ) : null}

      <p className="text-sm text-charcoal/70">
        Answers calls your team doesn&apos;t pick up — in business hours
        after the phone rings unanswered, or directly after hours. It
        discloses it&apos;s a virtual assistant at the start of every call.
      </p>

      <div className="flex items-center justify-between rounded-lg border border-charcoal/10 bg-white p-3">
        <div>
          <p className="text-sm font-medium">AI receptionist</p>
          <p className="text-xs text-charcoal/50">{enabled ? "On" : "Off"}</p>
        </div>
        {canEdit ? (
          <Button type="button" size="sm" variant={enabled ? "outline" : "secondary"} disabled={pending} onClick={toggleEnabled}>
            {enabled ? "Turn off" : "Turn on"}
          </Button>
        ) : null}
      </div>

      <div className="flex items-center justify-between rounded-lg border border-charcoal/10 bg-white p-3">
        <div>
          <p className="text-sm font-medium">Booking</p>
          <p className="text-xs text-charcoal/50">
            {bookingEnabled ? "The AI can book appointments" : "The AI only takes messages"}
          </p>
        </div>
        {canEdit ? (
          <Button
            type="button"
            size="sm"
            variant={bookingEnabled ? "outline" : "secondary"}
            disabled={pending || !enabled}
            onClick={toggleBooking}
          >
            {bookingEnabled ? "Turn off" : "Turn on"}
          </Button>
        ) : null}
      </div>

      <div className="flex items-center justify-between rounded-lg border border-charcoal/10 bg-white p-3 opacity-60">
        <div>
          <p className="text-sm font-medium">Web-lead call-backs</p>
          <p className="text-xs text-charcoal/50">Coming soon</p>
        </div>
        <Button type="button" size="sm" variant="outline" disabled>
          Off
        </Button>
      </div>

      <div className="rounded-lg border border-charcoal/10 bg-white p-3 text-sm">
        <p className="font-medium">Minutes used this month</p>
        <p className={overAllowance ? "mt-1 text-red-600" : "mt-1 text-charcoal/70"}>
          {minutesUsedThisMonth.toFixed(1)} / {minutesAllowance.toFixed(0)} min
          {overAllowance ? " — over allowance" : ""}
        </p>
        {isAdmin ? (
          <div className="mt-3 flex items-end gap-2">
            <div>
              <Label htmlFor="retellMinutesAllowance">Monthly allowance (admin)</Label>
              <Input
                id="retellMinutesAllowance"
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
