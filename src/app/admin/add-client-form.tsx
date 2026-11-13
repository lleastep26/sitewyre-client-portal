"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { addClient } from "./actions";

const NICHES = [
  "roofing",
  "hvac",
  "plumbing",
  "cleaning",
  "landscaping",
  "electrical",
  "painting",
  "general_contractor",
  "other",
] as const;

export function AddClientForm() {
  const [open, setOpen] = useState(false);
  const [businessName, setBusinessName] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [niche, setNiche] = useState<(typeof NICHES)[number]>("cleaning");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!open) {
    return (
      <Button type="button" variant="secondary" onClick={() => setOpen(true)}>
        + Add client
      </Button>
    );
  }

  function submit() {
    setError(null);
    start(async () => {
      const fd = new FormData();
      fd.set("businessName", businessName);
      fd.set("ownerName", ownerName);
      fd.set("ownerEmail", ownerEmail);
      fd.set("phone", phone);
      fd.set("niche", niche);
      const result = await addClient(fd);
      if ("error" in result) setError(result.error);
      else window.location.reload();
    });
  }

  return (
    <div className="rounded-xl border border-charcoal/10 bg-white p-3 text-sm">
      <p className="font-medium">Add client</p>
      <div className="mt-2 space-y-2">
        <Input
          value={businessName}
          onChange={(e) => setBusinessName(e.target.value)}
          placeholder="Business name"
        />
        <Input
          value={ownerName}
          onChange={(e) => setOwnerName(e.target.value)}
          placeholder="Owner name"
        />
        <Input
          value={ownerEmail}
          onChange={(e) => setOwnerEmail(e.target.value)}
          type="email"
          placeholder="Owner email"
        />
        <Input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="Phone"
        />
        <select
          value={niche}
          onChange={(e) => setNiche(e.target.value as (typeof NICHES)[number])}
          className="h-11 w-full rounded-md border border-charcoal/20 px-3 text-sm"
        >
          {NICHES.map((n) => (
            <option key={n} value={n}>
              {n.replace("_", " ")}
            </option>
          ))}
        </select>
      </div>
      {error ? <p className="mt-2 text-xs text-red-600">{error}</p> : null}
      <div className="mt-3 flex gap-2">
        <Button type="button" disabled={pending} onClick={submit}>
          {pending ? "Creating…" : "Create"}
        </Button>
        <Button type="button" variant="outline" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
