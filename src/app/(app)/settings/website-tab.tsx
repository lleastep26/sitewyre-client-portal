"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { InstallGuide } from "@/lib/website/install-guides";
import {
  setFormCapture,
  setWebsiteConsentConfirmed,
  setWebsiteDomain,
} from "./website-actions";

export type WebsiteStatusView =
  | { state: "no_domain" }
  | { state: "not_seen" }
  | { state: "connected"; host: string; seenLabel: string }
  | { state: "other_site"; host: string; seenLabel: string };

export type EmbedSnippet = { id: string; title: string; description: string; code: string };

function CopyBlock({ code, label }: { code: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div>
      <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-charcoal/5 p-3 font-mono text-xs text-charcoal">
        {code}
      </pre>
      <Button
        type="button"
        size="sm"
        variant="secondary"
        className="mt-2"
        onClick={() => {
          void navigator.clipboard.writeText(code).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          });
        }}
      >
        {copied ? "Copied" : label}
      </Button>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 border-t border-charcoal/10 pt-5 first:border-t-0 first:pt-0">
      <h3 className="text-sm font-semibold text-charcoal">{title}</h3>
      {children}
    </section>
  );
}

export function WebsiteTab({
  canEdit,
  domain,
  status,
  snippet,
  gtmSnippet,
  captureEnabled,
  chatEnabled,
  consentConfirmedLabel,
  consentText,
  privacyText,
  guides,
  embeds,
}: {
  canEdit: boolean;
  domain: string | null;
  status: WebsiteStatusView;
  snippet: string | null;
  gtmSnippet: string | null;
  captureEnabled: boolean;
  chatEnabled: boolean;
  /** When consent was confirmed, already formatted; null if it isn't. */
  consentConfirmedLabel: string | null;
  consentText: string;
  privacyText: string;
  guides: InstallGuide[];
  embeds: EmbedSnippet[];
}) {
  const [site, setSite] = useState(domain ?? "");
  const [capture, setCapture] = useState(captureEnabled);
  const [consent, setConsent] = useState(!!consentConfirmedLabel);
  const [message, setMessage] = useState<{ where: string; kind: "ok" | "error"; text: string } | null>(null);
  const [pending, start] = useTransition();

  function run(where: string, action: () => Promise<{ ok: true } | { error: string }>, done: string, undo?: () => void) {
    setMessage(null);
    start(async () => {
      const result = await action();
      if ("error" in result) {
        undo?.();
        setMessage({ where, kind: "error", text: result.error });
      } else setMessage({ where, kind: "ok", text: done });
    });
  }

  function note(where: string) {
    if (message?.where !== where) return null;
    return (
      <p className={message.kind === "ok" ? "text-sm text-copper" : "text-sm text-red-600"}>
        {message.text}
      </p>
    );
  }

  const statusLine =
    status.state === "connected" ? (
      <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
        <span className="font-medium">Connected to your website.</span> Last seen on {status.host},{" "}
        {status.seenLabel}.
      </p>
    ) : status.state === "other_site" ? (
      <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
        <span className="font-medium">Seen on a different website.</span> The code last loaded on{" "}
        {status.host} ({status.seenLabel}), not on {domain ?? "your saved website"}. Chat and form capture
        only work on the website address saved below.
      </p>
    ) : (
      <p className="rounded-lg bg-charcoal/5 px-3 py-2 text-sm text-charcoal/70">
        <span className="font-medium">Not detected yet.</span>{" "}
        {status.state === "no_domain"
          ? "Save your website address, then add the code to your site."
          : "Add the code to your site, then open any page of it."}
      </p>
    );

  return (
    <div className="space-y-5">
      {!canEdit ? (
        <p className="rounded-lg bg-charcoal/5 px-3 py-2 text-xs text-charcoal/60">
          View only — only the business owner or a Sitewyre admin can change these settings.
        </p>
      ) : null}

      <Section title="Status">{statusLine}</Section>

      <Section title="1. Your website address">
        <p className="text-sm text-charcoal/70">
          The website your customers visit. Sitewyre only accepts chats and form submissions from
          this address.
        </p>
        <div className="flex gap-2">
          <Label htmlFor="websiteDomain" className="sr-only">
            Website address
          </Label>
          <Input
            id="websiteDomain"
            value={site}
            onChange={(e) => setSite(e.target.value)}
            disabled={!canEdit}
            placeholder="yourbusiness.com"
            inputMode="url"
          />
          {canEdit ? (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={pending}
              onClick={() => {
                const fd = new FormData();
                fd.set("domain", site);
                run("domain", () => setWebsiteDomain(fd), "Saved.");
              }}
            >
              Save
            </Button>
          ) : null}
        </div>
        {note("domain")}
      </Section>

      <Section title="2. Add this code to your website">
        <p className="text-sm text-charcoal/70">
          One line, added once. It goes just before the closing <code>&lt;/body&gt;</code> tag, so it
          loads on every page. Step-by-step guides for each website builder are below.
        </p>
        {snippet ? (
          <CopyBlock code={snippet} label="Copy code" />
        ) : (
          <p className="text-sm text-charcoal/60">This business has no site key yet. Contact Sitewyre support.</p>
        )}
      </Section>

      <Section title="3. Choose what it does">
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-1"
            checked={capture}
            disabled={!canEdit || pending}
            onChange={(e) => {
              const next = e.target.checked;
              setCapture(next);
              const fd = new FormData();
              fd.set("enabled", String(next));
              run(
                "capture",
                () => setFormCapture(fd),
                next ? "Form capture is on." : "Form capture is off.",
                () => setCapture(!next),
              );
            }}
          />
          <span>
            <span className="font-medium">Capture my website&apos;s forms</span>
            <span className="mt-0.5 block text-charcoal/60">
              When a visitor sends a form on your site, Sitewyre gets a copy of their name, phone,
              email and message as a new lead. Your form keeps working exactly as it does now.
              Login, payment, checkout and search forms are never read. Leave this off if your
              website was built by Sitewyre: its forms already send leads here.
            </span>
          </span>
        </label>
        {note("capture")}
        <p className="text-sm text-charcoal/70">
          <span className="font-medium">Chat bubble:</span> {chatEnabled ? "on" : "off"}. Turn it on
          or off in the AI assistants tab.
        </p>
      </Section>

      <Section title="4. Text message consent (required before captured leads are texted)">
        <p className="text-sm text-charcoal/70">
          Phone carriers only allow texts to people who agreed to them. Add this wording directly
          under the button of every form on your website that asks for a phone number:
        </p>
        <CopyBlock code={consentText} label="Copy consent wording" />
        <p className="text-sm text-charcoal/70">
          Then add this section to your website&apos;s privacy policy, and link to the policy near
          the form:
        </p>
        <CopyBlock code={privacyText} label="Copy privacy section" />
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-1"
            checked={consent}
            disabled={!canEdit || pending}
            onChange={(e) => {
              const next = e.target.checked;
              setConsent(next);
              const fd = new FormData();
              fd.set("confirmed", String(next));
              run(
                "consent",
                () => setWebsiteConsentConfirmed(fd),
                next ? "Confirmed. New leads from your forms can be texted." : "Not confirmed. Leads from your forms won't be texted.",
                () => setConsent(!next),
              );
            }}
          />
          <span>
            <span className="font-medium">
              I&apos;ve added this wording under every form on my website, and the section to my
              privacy policy
            </span>
            <span className="mt-0.5 block text-charcoal/60">
              Until this is ticked, leads from your website&apos;s own forms still arrive, you
              still get alerted and they still get the email reply, but they are not texted.
              {consentConfirmedLabel ? ` Confirmed ${consentConfirmedLabel}.` : ""}
            </span>
          </span>
        </label>
        {note("consent")}
      </Section>

      {embeds.length ? (
        <Section title="Booking calendar and lead form for any page">
          <p className="text-sm text-charcoal/70">
            Paste one of these where you want it to appear on a page. They work on their own, with
            or without the code above, and the lead form already shows the consent wording.
          </p>
          {embeds.map((embed) => (
            <div key={embed.id} className="space-y-2">
              <p className="text-sm font-medium">{embed.title}</p>
              <p className="text-xs text-charcoal/60">{embed.description}</p>
              <CopyBlock code={embed.code} label="Copy embed code" />
            </div>
          ))}
        </Section>
      ) : null}

      <Section title="How to add the code on your website builder">
        <div className="space-y-2">
          {guides.map((guide) => (
            <details key={guide.id} className="rounded-lg border border-charcoal/10 bg-white px-3 py-2">
              <summary className="cursor-pointer text-sm font-medium">{guide.name}</summary>
              <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-charcoal/80">
                {guide.steps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
              {guide.uses === "gtm" && gtmSnippet ? (
                <div className="mt-2">
                  <CopyBlock code={gtmSnippet} label="Copy Tag Manager code" />
                </div>
              ) : null}
              <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-charcoal/60">
                {guide.notes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            </details>
          ))}
        </div>
      </Section>
    </div>
  );
}
