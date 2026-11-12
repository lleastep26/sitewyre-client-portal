"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  createClientEmailDomain,
  updateEmailSenderSettings,
  verifyClientEmailDomain,
} from "./email-actions";

type DnsRecord = {
  record: string;
  type: string;
  name: string;
  value: string;
  status: string;
};

const REGISTRAR_NOTES: { name: string; body: string }[] = [
  {
    name: "GoDaddy",
    body: "My Products → DNS → Add. Use the Type/Name/Value from each row exactly as shown; leave Name as-is, GoDaddy appends your domain automatically.",
  },
  {
    name: "Namecheap",
    body: "Domain List → Manage → Advanced DNS → Add New Record. Pick the matching record type, paste Host and Value.",
  },
  {
    name: "Cloudflare",
    body: "DNS → Records → Add record. Use the same Type/Name/Content. Set Proxy status to \"DNS only\" (gray cloud) for these records.",
  },
  {
    name: "Google Domains / Squarespace",
    body: "DNS settings → Custom records → Create new record. Enter the Type, Host name, and Data exactly as shown.",
  },
];

function statusLabel(status: string | undefined): { text: string; className: string } {
  switch (status) {
    case "verified":
      return { text: "Verified", className: "text-copper" };
    case "failed":
    case "temporary_failure":
      return { text: "Failed", className: "text-red-600" };
    case "pending":
      return { text: "Pending", className: "text-amber-700" };
    default:
      return { text: "Not started", className: "text-charcoal/50" };
  }
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard?.writeText(value).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
      className="shrink-0 text-xs text-copper"
    >
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

export function EmailTab({
  canEdit,
  domain,
  domainStatus,
  dnsRecords,
  fromName,
  replyTo,
  businessName,
}: {
  canEdit: boolean;
  domain: string | null;
  domainStatus: string | null;
  dnsRecords: DnsRecord[];
  fromName: string;
  replyTo: string;
  businessName: string | null;
}) {
  const [domainInput, setDomainInput] = useState("");
  const [records, setRecords] = useState(dnsRecords);
  const [status, setStatus] = useState(domainStatus);
  const [fromNameInput, setFromNameInput] = useState(fromName);
  const [replyToInput, setReplyToInput] = useState(replyTo);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(
    null,
  );
  const [pending, start] = useTransition();

  function createDomain() {
    setMessage(null);
    start(async () => {
      const fd = new FormData();
      fd.set("domain", domainInput);
      const result = await createClientEmailDomain(fd);
      if ("error" in result) setMessage({ kind: "error", text: result.error });
      else window.location.reload();
    });
  }

  function verify() {
    setMessage(null);
    start(async () => {
      const result = await verifyClientEmailDomain();
      if ("error" in result) setMessage({ kind: "error", text: result.error });
      else {
        setStatus(result.status);
        setRecords(result.records);
        setMessage({ kind: "ok", text: "Rechecked with Resend." });
      }
    });
  }

  function saveSender() {
    setMessage(null);
    start(async () => {
      const fd = new FormData();
      fd.set("email_from_name", fromNameInput);
      fd.set("email_reply_to", replyToInput);
      const result = await updateEmailSenderSettings(fd);
      if ("error" in result) setMessage({ kind: "error", text: result.error });
      else setMessage({ kind: "ok", text: "Saved." });
    });
  }

  const overall = statusLabel(status ?? undefined);

  return (
    <div className="space-y-5">
      {!canEdit ? (
        <p className="rounded-lg bg-charcoal/5 px-3 py-2 text-xs text-charcoal/60">
          View only — only the business owner or a Sitewyre admin can manage
          phone and email.
        </p>
      ) : null}

      <div>
        <Label>Sending domain</Label>
        <p className="mt-1 text-xs text-charcoal/50">
          Until this is verified, {businessName ?? "your business"}&apos;s
          emails keep sending from the current Sitewyre address.
        </p>

        {!domain ? (
          canEdit ? (
            <div className="mt-2 flex gap-2">
              <Input
                value={domainInput}
                onChange={(e) => setDomainInput(e.target.value)}
                placeholder="mail.yourbusiness.com"
              />
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={pending}
                onClick={createDomain}
              >
                Add
              </Button>
            </div>
          ) : (
            <p className="mt-2 text-sm text-charcoal/50">Not set up</p>
          )
        ) : (
          <>
            <div className="mt-2 flex items-center justify-between gap-2">
              <span className="text-sm text-charcoal">{domain}</span>
              <span className={`text-sm font-medium ${overall.className}`}>
                {overall.text}
              </span>
            </div>

            <div className="mt-3 space-y-2">
              {records.map((r) => (
                <div
                  key={`${r.record}-${r.name}`}
                  className="rounded-lg border border-charcoal/10 bg-white p-3 text-xs"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-charcoal">{r.record}</span>
                    <span className={statusLabel(r.status).className}>
                      {statusLabel(r.status).text}
                    </span>
                  </div>
                  <div className="mt-1 grid grid-cols-[auto_1fr_auto] items-center gap-x-2 gap-y-0.5">
                    <span className="text-charcoal/50">Type</span>
                    <span className="truncate">{r.type}</span>
                    <span />
                    <span className="text-charcoal/50">Name</span>
                    <span className="truncate">{r.name}</span>
                    <CopyButton value={r.name} />
                    <span className="text-charcoal/50">Value</span>
                    <span className="truncate">{r.value}</span>
                    <CopyButton value={r.value} />
                  </div>
                </div>
              ))}
            </div>

            {canEdit ? (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className="mt-3"
                disabled={pending}
                onClick={verify}
              >
                {pending ? "Checking…" : "Verify"}
              </Button>
            ) : null}

            <details className="mt-3 text-xs text-charcoal/60">
              <summary className="cursor-pointer text-copper">
                How to add these at your registrar
              </summary>
              <ul className="mt-2 space-y-2">
                {REGISTRAR_NOTES.map((r) => (
                  <li key={r.name}>
                    <span className="font-medium text-charcoal">{r.name}:</span>{" "}
                    {r.body}
                  </li>
                ))}
              </ul>
            </details>
          </>
        )}
      </div>

      <div>
        <Label htmlFor="email_from_name">From name</Label>
        <Input
          id="email_from_name"
          value={fromNameInput}
          onChange={(e) => setFromNameInput(e.target.value)}
          disabled={!canEdit}
          placeholder={businessName ?? "Your Business"}
        />
      </div>
      <div>
        <Label htmlFor="email_reply_to">Reply-to address</Label>
        <Input
          id="email_reply_to"
          type="email"
          value={replyToInput}
          onChange={(e) => setReplyToInput(e.target.value)}
          disabled={!canEdit}
        />
      </div>
      {canEdit ? (
        <Button type="button" className="w-full" disabled={pending} onClick={saveSender}>
          Save
        </Button>
      ) : null}

      {message ? (
        <p className={message.kind === "ok" ? "text-sm text-copper" : "text-sm text-red-600"}>
          {message.text}
        </p>
      ) : null}
    </div>
  );
}
