"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { previewReviewBlastCsv, confirmReviewBlast } from "./actions";

type PreviewRow = {
  lineNumber: number;
  firstName: string;
  phone: string;
  jobType: string;
  jobDate: string;
};
type SkippedRow = PreviewRow & { reason: string };
type Preview = {
  valid: PreviewRow[];
  skipped: SkippedRow[];
  totalDataRows: number;
  truncated: boolean;
  fileName: string;
};

const REASON_LABEL: Record<string, string> = {
  missing_phone: "no phone number",
  bad_number: "bad phone number",
  duplicate: "duplicate in file",
  opted_out: "opted out",
  recent_review_request: "asked within the last 90 days",
};

export function ReviewBlastWizard({ customerNoun = "customer" }: { customerNoun?: string }) {
  const [pending, start] = useTransition();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [consented, setConsented] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [queued, setQueued] = useState<number | null>(null);

  if (queued !== null) {
    return (
      <div className="rounded-xl border border-charcoal/10 bg-white p-4">
        <p className="font-medium">Review blast started</p>
        <p className="mt-1 text-sm text-charcoal/70">
          Queued {queued} contact{queued === 1 ? "" : "s"}. Spread out at up
          to 40 texts a day, sent only between 9am–7pm.
        </p>
      </div>
    );
  }

  if (!preview) {
    return (
      <form
        className="space-y-3 rounded-xl border border-charcoal/10 bg-white p-4"
        onSubmit={(e) => {
          e.preventDefault();
          const input = e.currentTarget.elements.namedItem(
            "csv",
          ) as HTMLInputElement;
          const file = input.files?.[0];
          if (!file) return;
          start(async () => {
            const fd = new FormData();
            fd.set("csv", file);
            const res = await previewReviewBlastCsv(fd);
            if ("error" in res && res.error) setError(res.error);
            else if (res.preview) {
              setPreview(res.preview);
              setError(null);
            }
          });
        }}
      >
        <div>
          <label className="text-sm font-medium" htmlFor="csv">
            Past-{customerNoun} CSV
          </label>
          <input
            id="csv"
            name="csv"
            type="file"
            accept=".csv,text/csv"
            required
            className="mt-1 block w-full text-sm"
          />
          <p className="mt-1 text-xs text-charcoal/60">
            Columns: first_name, phone, job_type (optional), job_date
            (optional). Up to 2,000 rows.
          </p>
        </div>
        {error ? <p className="text-sm text-red-700">{error}</p> : null}
        <Button type="submit" disabled={pending}>
          {pending ? "Reading…" : "Preview"}
        </Button>
      </form>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-charcoal/10 bg-white p-4">
        <p className="font-medium">
          {preview.valid.length} contact{preview.valid.length === 1 ? "" : "s"}{" "}
          will be texted
        </p>
        {preview.truncated ? (
          <p className="mt-1 text-xs text-amber-700">
            This file has more than 2,000 rows — only the first 2,000 were
            processed. Split the rest into a separate file.
          </p>
        ) : null}
        {preview.skipped.length ? (
          <details className="mt-2 text-sm text-charcoal/70">
            <summary>{preview.skipped.length} skipped</summary>
            <ul className="mt-1 max-h-48 space-y-0.5 overflow-y-auto">
              {preview.skipped.slice(0, 200).map((row, i) => (
                <li key={i}>
                  Line {row.lineNumber}: {row.phone || "(no phone)"} —{" "}
                  {REASON_LABEL[row.reason] ?? row.reason}
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </div>

      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          checked={consented}
          onChange={(e) => setConsented(e.target.checked)}
          className="mt-0.5"
        />
        I confirm these are my real past customers who gave me their phone
        number.
      </label>

      {error ? <p className="text-sm text-red-700">{error}</p> : null}

      <div className="flex gap-2">
        <Button
          variant="secondary"
          disabled={pending}
          onClick={() => {
            setPreview(null);
            setError(null);
          }}
        >
          Back
        </Button>
        <Button
          disabled={!consented || pending || preview.valid.length === 0}
          onClick={() =>
            start(async () => {
              const fd = new FormData();
              fd.set("rows", JSON.stringify(preview.valid));
              fd.set("fileName", preview.fileName);
              fd.set("totalDataRows", String(preview.totalDataRows));
              fd.set("skippedCount", String(preview.skipped.length));
              const res = await confirmReviewBlast(fd);
              if ("error" in res && res.error) setError(res.error);
              else setQueued(res.queued ?? 0);
            })
          }
        >
          {pending ? "Starting…" : `Send to ${preview.valid.length}`}
        </Button>
      </div>
    </div>
  );
}
