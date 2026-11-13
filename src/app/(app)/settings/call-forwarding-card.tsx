"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  FORWARDING_CARRIERS,
  forwardingGuide,
  formatUsPhone,
  type ForwardingCarrier,
} from "@/lib/phone/forwarding-instructions";
import { setCallForwarding } from "./phone-actions";

export function CallForwardingCard({
  canEdit,
  sitewyreNumber,
  aiReceptionistOn,
  enabled,
  businessLinePhone,
  lastForwardedCallLabel,
}: {
  canEdit: boolean;
  sitewyreNumber: string | null;
  aiReceptionistOn: boolean;
  enabled: boolean;
  businessLinePhone: string | null;
  /** When the most recent forwarded call arrived, already formatted. */
  lastForwardedCallLabel: string | null;
}) {
  const [on, setOn] = useState(enabled);
  const [businessLine, setBusinessLine] = useState(formatUsPhone(businessLinePhone));
  const [carrier, setCarrier] = useState<ForwardingCarrier>("verizon");
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [pending, start] = useTransition();

  const guide = forwardingGuide(carrier, sitewyreNumber);
  const blocked = !sitewyreNumber
    ? "This business needs a Sitewyre number first (above)."
    : !aiReceptionistOn
      ? "Turn on the AI receptionist first (AI assistants tab). Forwarded calls are answered by it."
      : null;

  function save() {
    setMessage(null);
    start(async () => {
      const fd = new FormData();
      fd.set("enabled", String(on));
      fd.set("businessLinePhone", businessLine);
      const result = await setCallForwarding(fd);
      if ("error" in result) setMessage({ kind: "error", text: result.error });
      else setMessage({ kind: "ok", text: "Saved." });
    });
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2 text-sm text-charcoal/70">
        <p>
          Keep advertising the number your customers already know. Your phone
          rings first, as it does today. If you don&apos;t answer, your phone
          company passes the call to your Sitewyre number
          {sitewyreNumber ? ` (${formatUsPhone(sitewyreNumber)})` : ""} and the AI
          receptionist picks up.
        </p>
        <p>
          With this on, every call to your Sitewyre number goes straight to
          the AI receptionist, at any hour, without ringing you again.
        </p>
      </div>

      <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
        <span className="font-medium">If this number is your personal cell:</span>{" "}
        personal calls you don&apos;t answer will also reach the AI receptionist
        instead of your voicemail.
      </p>

      {blocked ? (
        <p className="rounded-lg bg-charcoal/5 px-3 py-2 text-xs text-charcoal/60">{blocked}</p>
      ) : null}

      <div>
        <Label htmlFor="businessLinePhone">Your business number</Label>
        <p className="mt-1 text-xs text-charcoal/50">
          The number customers call, which will forward to Sitewyre.
        </p>
        <Input
          id="businessLinePhone"
          className="mt-2"
          value={businessLine}
          onChange={(e) => setBusinessLine(e.target.value)}
          disabled={!canEdit}
          placeholder="(555) 123-4567"
          inputMode="tel"
        />
      </div>

      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          className="mt-1"
          checked={on}
          onChange={(e) => setOn(e.target.checked)}
          disabled={!canEdit || (!!blocked && !on)}
        />
        <span>My business number forwards unanswered calls to Sitewyre</span>
      </label>

      {canEdit ? (
        <Button type="button" size="sm" variant="secondary" disabled={pending} onClick={save}>
          Save
        </Button>
      ) : null}

      {message ? (
        <p className={message.kind === "ok" ? "text-sm text-copper" : "text-sm text-red-600"}>
          {message.text}
        </p>
      ) : null}

      <div className="border-t border-charcoal/10 pt-4">
        <Label htmlFor="forwardingCarrier">Set it up on your phone</Label>
        <p className="mt-1 text-xs text-charcoal/50">
          Pick the phone company for your business number.
        </p>
        <select
          id="forwardingCarrier"
          className="mt-2 w-full rounded-md border border-charcoal/15 bg-white px-3 py-2 text-sm"
          value={carrier}
          onChange={(e) => setCarrier(e.target.value as ForwardingCarrier)}
        >
          {FORWARDING_CARRIERS.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>

        {guide.unconfirmed ? (
          <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900">
            Unconfirmed, check with {guide.label}.
          </p>
        ) : null}

        {guide.turnOn.length ? (
          <div className="mt-3">
            <p className="text-xs font-medium uppercase tracking-wide text-charcoal/50">Turn on</p>
            <ul className="mt-1 space-y-2">
              {guide.turnOn.map((step) => (
                <li key={step.code} className="text-sm">
                  <span className="text-charcoal/70">{step.label}</span>
                  <code className="mt-0.5 block rounded bg-charcoal/5 px-2 py-1 font-mono text-sm">
                    {step.code}
                  </code>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {guide.turnOff.length ? (
          <div className="mt-3">
            <p className="text-xs font-medium uppercase tracking-wide text-charcoal/50">Turn off</p>
            <ul className="mt-1 space-y-2">
              {guide.turnOff.map((step) => (
                <li key={step.code} className="text-sm">
                  <span className="text-charcoal/70">{step.label}</span>
                  <code className="mt-0.5 block rounded bg-charcoal/5 px-2 py-1 font-mono text-sm">
                    {step.code}
                  </code>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-charcoal/60">
          {guide.notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      </div>

      <div className="border-t border-charcoal/10 pt-4 text-sm">
        <p className="font-medium">Check it works</p>
        <p className="mt-1 text-charcoal/70">
          Call your business number from another phone and don&apos;t answer.
          The AI receptionist should pick up after your phone stops ringing.
        </p>
        <p className="mt-1 text-xs text-charcoal/60">
          {lastForwardedCallLabel
            ? `Last forwarded call received: ${lastForwardedCallLabel}.`
            : "No forwarded call received yet."}
        </p>
      </div>
    </div>
  );
}
