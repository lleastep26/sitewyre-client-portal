"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { submitEmbedLead } from "./actions";
import { TurnstileField } from "@/components/security/turnstile-field";

export function EmbedLeadForm({
  siteKey,
  businessName,
  consentText,
  turnstileSiteKey,
}: {
  siteKey: string;
  businessName: string;
  consentText: string;
  /** Turnstile site key, or null when the bot check isn't set up. */
  turnstileSiteKey: string | null;
}) {
  const [attempt, setAttempt] = useState(0);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (sent) {
    return (
      <div role="status">
        <h2 className="font-display text-2xl text-charcoal">Thanks, we&apos;ve got it</h2>
        <p className="mt-2 text-sm text-charcoal/70">{businessName} will get back to you shortly.</p>
      </div>
    );
  }

  return (
    <form
      className="space-y-3"
      action={(formData) => {
        setError(null);
        start(async () => {
          const result = await submitEmbedLead(siteKey, formData);
          if ("error" in result) {
            setError(result.error);
            // A bot-check answer can only be used once: get a fresh one.
            setAttempt((n) => n + 1);
          } else setSent(true);
        });
      }}
    >
      <div>
        <Label htmlFor="lead-name">Your name</Label>
        <Input id="lead-name" name="name" autoComplete="name" required maxLength={100} className="mt-1" />
      </div>
      <div>
        <Label htmlFor="lead-phone">Phone number</Label>
        <Input id="lead-phone" name="phone" type="tel" autoComplete="tel" required maxLength={30} className="mt-1" />
      </div>
      <div>
        <Label htmlFor="lead-email">Email (optional)</Label>
        <Input id="lead-email" name="email" type="email" autoComplete="email" maxLength={200} className="mt-1" />
      </div>
      <div>
        <Label htmlFor="lead-message">What do you need?</Label>
        <Textarea id="lead-message" name="message" rows={4} required maxLength={2000} className="mt-1" />
      </div>
      <div className="absolute -left-[9999px]" aria-hidden="true">
        <label htmlFor="lead-website">Website</label>
        <input id="lead-website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>
      {error ? (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      ) : null}
      <TurnstileField key={attempt} siteKey={turnstileSiteKey} />
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Sending…" : "Send"}
      </Button>
      <p className="text-[11px] leading-snug text-charcoal/55">{consentText}</p>
    </form>
  );
}
