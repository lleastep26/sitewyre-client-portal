"use client";

import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  checkA2pWebsite,
  startA2pRegistration,
  advanceA2pRegistration,
  retryA2pStage,
  resendA2pOtp,
} from "./a2p-actions";

const STAGE_LABEL: Record<string, string> = {
  not_started: "Not started",
  customer_profile: "Setting up your business profile with Twilio…",
  trust_bundle: "Submitting business details for review…",
  brand: "Registering your business (Brand)…",
  otp_pending: "Waiting for you to confirm the verification text…",
  messaging_service: "Setting up your messaging line…",
  attach_number: "Linking your phone number…",
  campaign: "Registering your texting use case (Campaign)…",
  complete: "Waiting on campaign approval…",
};

const REGISTRATION_COST: Record<"sole_prop" | "low_volume_standard" | "same_entity", string> = {
  sole_prop: "$4.50 one-time brand fee + $15 one-time campaign fee, then $2/month",
  low_volume_standard: "$4.50 one-time brand fee + $15 one-time campaign fee, then $1.50/month",
  same_entity: "$15 one-time campaign fee (no new brand fee), then $1.50/month",
};

export function A2pTab({
  canEdit,
  isAdmin,
  website,
  registrationType,
  einMasked,
  stage,
  error,
  a2pStatus,
  businessPhone,
}: {
  canEdit: boolean;
  isAdmin: boolean;
  website: string | null;
  registrationType: "sole_prop" | "low_volume_standard" | "same_entity" | null;
  einMasked: string | null;
  stage: string;
  error: string | null;
  a2pStatus: string | null;
  businessPhone: string | null;
}) {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [websiteOk, setWebsiteOk] = useState<boolean | null>(null);
  const [path, setPath] = useState<"sole_prop" | "low_volume_standard" | "same_entity">("sole_prop");
  const [ein, setEin] = useState("");
  const [confirmPrivacy, setConfirmPrivacy] = useState(false);
  const [confirmConsent, setConfirmConsent] = useState(false);

  useEffect(() => {
    if (!registrationType) {
      checkA2pWebsite().then((r) => setWebsiteOk("ok" in r ? r.ok : false));
    }
  }, [registrationType]);

  function submit() {
    setMessage(null);
    const fd = new FormData();
    fd.set("registrationType", path);
    if (path === "low_volume_standard") fd.set("ein", ein);
    if (confirmPrivacy) fd.set("confirmPrivacyPolicy", "on");
    if (confirmConsent) fd.set("confirmLeadFormConsent", "on");
    start(async () => {
      const result = await startA2pRegistration(fd);
      if ("error" in result) setMessage({ kind: "error", text: result.error });
      else window.location.reload();
    });
  }

  function continueStage() {
    setMessage(null);
    const cost =
      stage === "brand"
        ? registrationType
          ? REGISTRATION_COST[registrationType].split(",")[0]
          : "a one-time brand fee"
        : stage === "campaign"
          ? "a $15 one-time campaign fee, then a monthly recurring fee"
          : null;
    if (cost) {
      const confirmed = window.confirm(
        `This submits your ${stage === "brand" ? "Brand" : "Campaign"} registration to Twilio, which charges ${cost}. Continue?`,
      );
      if (!confirmed) return;
    }
    start(async () => {
      const result = await advanceA2pRegistration();
      if ("error" in result) setMessage({ kind: "error", text: result.error });
      else window.location.reload();
    });
  }

  function retry() {
    setMessage(null);
    start(async () => {
      const result = await retryA2pStage();
      if ("error" in result) setMessage({ kind: "error", text: result.error });
      else window.location.reload();
    });
  }

  function resendOtp() {
    setMessage(null);
    start(async () => {
      const result = await resendA2pOtp();
      if ("error" in result) setMessage({ kind: "error", text: result.error });
      else setMessage({ kind: "ok", text: "Verification text re-sent." });
    });
  }

  if (!canEdit) {
    return (
      <p className="rounded-lg bg-charcoal/5 px-3 py-2 text-xs text-charcoal/60">
        View only — only the business owner or a Sitewyre admin can manage texting registration.
      </p>
    );
  }

  if (a2pStatus === "approved") {
    return (
      <p className="rounded-lg bg-copper/10 px-3 py-2 text-sm font-medium text-copper">
        Texting is approved — messages send from your registered number.
      </p>
    );
  }

  if (!registrationType) {
    return (
      <div className="space-y-4">
        <div>
          <Label>Do you have a Tax ID (EIN) for this business?</Label>
          <div className="mt-2 flex gap-2">
            <Button
              type="button"
              variant={path === "low_volume_standard" ? "default" : "secondary"}
              size="sm"
              onClick={() => setPath("low_volume_standard")}
            >
              Yes, I have an EIN
            </Button>
            <Button
              type="button"
              variant={path === "sole_prop" ? "default" : "secondary"}
              size="sm"
              onClick={() => setPath("sole_prop")}
            >
              No EIN
            </Button>
            {isAdmin ? (
              <Button
                type="button"
                variant={path === "same_entity" ? "default" : "secondary"}
                size="sm"
                onClick={() => setPath("same_entity")}
              >
                Same legal entity as Sitewyre
              </Button>
            ) : null}
          </div>
          {path === "sole_prop" ? (
            <p className="mt-2 text-xs text-charcoal/50">
              Sole Proprietor registration: limited to 1 phone number and lower message
              throughput. We&apos;ll text a verification code to {businessPhone || "your business phone"} —
              reply YES to confirm it&apos;s you.
            </p>
          ) : null}
          {path === "same_entity" ? (
            <p className="mt-2 text-xs text-charcoal/50">
              Admin only. Skips a new Brand filing entirely and registers this client&apos;s
              texting under Sitewyre&apos;s own already-approved brand — use only when this
              business is the same legal entity/EIN as Sitewyre itself, to avoid a
              duplicate-EIN rejection from Twilio.
            </p>
          ) : null}
        </div>

        {path === "low_volume_standard" ? (
          <div>
            <Label htmlFor="ein">EIN</Label>
            <Input id="ein" value={ein} onChange={(e) => setEin(e.target.value)} placeholder="12-3456789" />
          </div>
        ) : null}

        <div className="space-y-2 rounded-lg border border-charcoal/10 p-3 text-sm">
          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              checked={confirmPrivacy}
              onChange={(e) => setConfirmPrivacy(e.target.checked)}
              className="mt-1"
            />
            <span>Your website has a privacy policy that mentions SMS/text messaging.</span>
          </label>
          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              checked={confirmConsent}
              onChange={(e) => setConfirmConsent(e.target.checked)}
              className="mt-1"
            />
            <span>Your lead/contact form discloses or confirms consent to SMS.</span>
          </label>
          <div className="flex items-center gap-2">
            {websiteOk === null ? (
              <span className="text-charcoal/50">Checking your website…</span>
            ) : websiteOk ? (
              <span className="text-copper">✅ Your website URL loads correctly</span>
            ) : (
              <span className="text-red-600">
                ❌ {website ? "Your website didn't load" : "Add your website URL in Business Profile first"}
              </span>
            )}
          </div>
        </div>

        <p className="text-xs text-charcoal/50">
          Registration costs: {REGISTRATION_COST[path]}, billed to the Sitewyre Twilio account.
        </p>

        <Button
          type="button"
          disabled={pending || !confirmPrivacy || !confirmConsent || websiteOk === false || websiteOk === null}
          onClick={() => {
            const confirmed = window.confirm(
              `Submit for registration? This path costs ${REGISTRATION_COST[path]}.`,
            );
            if (confirmed) submit();
          }}
        >
          Submit for registration
        </Button>
        {message ? (
          <p className={message.kind === "ok" ? "text-sm text-copper" : "text-sm text-red-600"}>
            {message.text}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium text-charcoal">{STAGE_LABEL[stage] ?? stage}</p>
      {einMasked ? <p className="text-xs text-charcoal/50">EIN on file: {einMasked}</p> : null}

      {a2pStatus === "failed" && error ? (
        <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
          <p className="font-medium">Registration was rejected:</p>
          <p className="mt-1">{error}</p>
          <Button type="button" size="sm" className="mt-2" disabled={pending} onClick={retry}>
            Fix and retry
          </Button>
        </div>
      ) : (
        <div className="flex gap-2">
          {stage === "otp_pending" ? (
            <Button type="button" size="sm" variant="secondary" disabled={pending} onClick={resendOtp}>
              Resend verification text
            </Button>
          ) : null}
          <Button type="button" size="sm" disabled={pending} onClick={continueStage}>
            {pending ? "Checking…" : "Refresh status"}
          </Button>
        </div>
      )}

      {message ? (
        <p className={message.kind === "ok" ? "text-sm text-copper" : "text-sm text-red-600"}>
          {message.text}
        </p>
      ) : null}
    </div>
  );
}
