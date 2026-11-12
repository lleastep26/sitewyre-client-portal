"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  buyOwnNumber,
  previewOwnNumber,
  setOwnForwardPhone,
  setSmsMonthlyAllowance,
} from "./phone-actions";

export function PhoneTab({
  canEdit,
  isAdmin,
  twilioPhoneNumber,
  forwardToPhone,
  smsOutboundThisMonth,
  smsMonthlyAllowance,
}: {
  canEdit: boolean;
  isAdmin: boolean;
  twilioPhoneNumber: string | null;
  forwardToPhone: string | null;
  smsOutboundThisMonth: number;
  smsMonthlyAllowance: number;
}) {
  const [forwardPhone, setForwardPhone] = useState(forwardToPhone ?? "");
  const [areaCode, setAreaCode] = useState("");
  const [preview, setPreview] = useState<{ phoneNumber: string; monthlyPrice: string } | null>(
    null,
  );
  const [boughtNumber, setBoughtNumber] = useState<string | null>(twilioPhoneNumber);
  const [allowance, setAllowance] = useState(String(smsMonthlyAllowance));
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(
    null,
  );
  const [pending, start] = useTransition();

  function saveForwardPhone() {
    setMessage(null);
    start(async () => {
      const fd = new FormData();
      fd.set("forwardPhone", forwardPhone);
      const result = await setOwnForwardPhone(fd);
      if ("error" in result) setMessage({ kind: "error", text: result.error });
      else setMessage({ kind: "ok", text: "Saved." });
    });
  }

  function search() {
    setMessage(null);
    setPreview(null);
    start(async () => {
      const fd = new FormData();
      fd.set("areaCode", areaCode);
      const result = await previewOwnNumber(fd);
      if ("error" in result) setMessage({ kind: "error", text: result.error });
      else setPreview(result);
    });
  }

  function buy() {
    if (!preview) return;
    const confirmed = window.confirm(
      `Buy ${preview.phoneNumber} for this business? This charges the Twilio account $${preview.monthlyPrice}/month.`,
    );
    if (!confirmed) return;
    start(async () => {
      const fd = new FormData();
      fd.set("phoneNumber", preview.phoneNumber);
      const result = await buyOwnNumber(fd);
      if ("error" in result) setMessage({ kind: "error", text: result.error });
      else {
        setBoughtNumber(result.phoneNumber);
        setPreview(null);
        setMessage({ kind: "ok", text: `Bought ${result.phoneNumber}.` });
      }
    });
  }

  function saveAllowance() {
    setMessage(null);
    start(async () => {
      const fd = new FormData();
      fd.set("smsMonthlyAllowance", allowance);
      const result = await setSmsMonthlyAllowance(fd);
      if ("error" in result) setMessage({ kind: "error", text: result.error });
      else setMessage({ kind: "ok", text: "Allowance updated." });
    });
  }

  const usagePct = smsMonthlyAllowance > 0
    ? Math.min(100, Math.round((smsOutboundThisMonth / smsMonthlyAllowance) * 100))
    : 0;

  return (
    <div className="space-y-5">
      {!canEdit ? (
        <p className="rounded-lg bg-charcoal/5 px-3 py-2 text-xs text-charcoal/60">
          View only — only the business owner or a Sitewyre admin can manage
          phone and email.
        </p>
      ) : null}

      <div>
        <Label htmlFor="forwardPhone">Forward calls to</Label>
        <p className="mt-1 text-xs text-charcoal/50">
          Required before buying a number — incoming calls ring here.
        </p>
        <div className="mt-2 flex gap-2">
          <Input
            id="forwardPhone"
            value={forwardPhone}
            onChange={(e) => setForwardPhone(e.target.value)}
            disabled={!canEdit}
            placeholder="(555) 123-4567"
          />
          {canEdit ? (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={pending}
              onClick={saveForwardPhone}
            >
              Save
            </Button>
          ) : null}
        </div>
      </div>

      <div>
        <Label>Twilio number</Label>
        {boughtNumber ? (
          <p className="mt-1 text-sm text-charcoal">{boughtNumber}</p>
        ) : (
          <>
            <p className="mt-1 text-xs text-charcoal/50">
              Local numbers are ~$1.15/month, billed to the Sitewyre Twilio
              account.
            </p>
            {canEdit ? (
              <div className="mt-2 space-y-1.5">
                <div className="flex gap-2">
                  <Input
                    value={areaCode}
                    onChange={(e) => setAreaCode(e.target.value.replace(/\D/g, "").slice(0, 3))}
                    placeholder="Area code"
                    inputMode="numeric"
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    disabled={pending}
                    onClick={search}
                  >
                    Search
                  </Button>
                </div>
                {preview ? (
                  <div className="flex items-center justify-between gap-2 rounded-md bg-charcoal/5 px-3 py-2 text-sm">
                    <span>
                      {preview.phoneNumber} — ${preview.monthlyPrice}/mo
                    </span>
                    <Button type="button" size="sm" disabled={pending} onClick={buy}>
                      Buy
                    </Button>
                  </div>
                ) : null}
              </div>
            ) : null}
          </>
        )}
      </div>

      <div>
        <Label>SMS usage this month</Label>
        <p className="mt-1 text-sm text-charcoal">
          {smsOutboundThisMonth} of {smsMonthlyAllowance} texts
        </p>
        <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-charcoal/10">
          <div
            className="h-full bg-copper"
            style={{ width: `${usagePct}%` }}
          />
        </div>
        {smsOutboundThisMonth > smsMonthlyAllowance ? (
          <p className="mt-1 text-xs text-amber-700">
            Over the monthly allowance — overage isn&apos;t billed yet.
          </p>
        ) : null}
        {isAdmin ? (
          <div className="mt-2 flex items-center gap-2">
            <Input
              value={allowance}
              onChange={(e) => setAllowance(e.target.value.replace(/\D/g, ""))}
              inputMode="numeric"
              className="w-28"
            />
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={pending}
              onClick={saveAllowance}
            >
              Save allowance
            </Button>
          </div>
        ) : null}
      </div>

      {message ? (
        <p className={message.kind === "ok" ? "text-sm text-copper" : "text-sm text-red-600"}>
          {message.text}
        </p>
      ) : null}
    </div>
  );
}
