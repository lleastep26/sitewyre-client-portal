"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { buyClientNumber, previewClientNumber } from "./actions";

export function NumberPurchase({ clientId }: { clientId: string }) {
  const [areaCode, setAreaCode] = useState("");
  const [preview, setPreview] = useState<{
    phoneNumber: string;
    monthlyPrice: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [bought, setBought] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function search() {
    setError(null);
    setPreview(null);
    start(async () => {
      const fd = new FormData();
      fd.set("clientId", clientId);
      fd.set("areaCode", areaCode);
      const result = await previewClientNumber(fd);
      if (result.error) setError(result.error);
      else if (result.phoneNumber && result.monthlyPrice) {
        setPreview({ phoneNumber: result.phoneNumber, monthlyPrice: result.monthlyPrice });
      }
    });
  }

  function buy() {
    if (!preview) return;
    const confirmed = window.confirm(
      `Buy ${preview.phoneNumber} for this client? This charges the Twilio account $${preview.monthlyPrice}/month.`,
    );
    if (!confirmed) return;
    start(async () => {
      const fd = new FormData();
      fd.set("clientId", clientId);
      fd.set("phoneNumber", preview.phoneNumber);
      const result = await buyClientNumber(fd);
      if (result.error) setError(result.error);
      else {
        setBought(result.phoneNumber ?? preview.phoneNumber);
        setPreview(null);
      }
    });
  }

  if (bought) {
    return <p className="mt-2 text-xs text-copper">Bought {bought}</p>;
  }

  return (
    <div className="mt-2 space-y-1.5 text-xs">
      <div className="flex gap-2">
        <input
          value={areaCode}
          onChange={(e) => setAreaCode(e.target.value.replace(/\D/g, "").slice(0, 3))}
          placeholder="Area code"
          inputMode="numeric"
          className="w-24 rounded-md border border-charcoal/15 px-2 py-1"
        />
        <Button type="button" size="sm" variant="secondary" disabled={pending} onClick={search}>
          {pending ? "…" : "Search"}
        </Button>
      </div>
      {error ? <p className="text-red-600">{error}</p> : null}
      {preview ? (
        <div className="flex items-center justify-between gap-2 rounded-md bg-charcoal/5 px-2 py-1.5">
          <span>
            {preview.phoneNumber} — ${preview.monthlyPrice}/mo
          </span>
          <Button type="button" size="sm" disabled={pending} onClick={buy}>
            {pending ? "…" : "Buy"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
