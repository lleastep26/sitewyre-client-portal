"use client";

import { useTransition } from "react";
import { setClientA2pStatus } from "./actions";

const OPTIONS = ["pending", "approved", "failed"] as const;

export function A2pStatusSelect({
  clientId,
  status,
}: {
  clientId: string;
  status: string | null;
}) {
  const [pending, start] = useTransition();

  return (
    <select
      defaultValue={status ?? "pending"}
      disabled={pending}
      onChange={(e) => {
        const next = e.target.value;
        start(async () => {
          const fd = new FormData();
          fd.set("clientId", clientId);
          fd.set("status", next);
          await setClientA2pStatus(fd);
        });
      }}
      className="rounded-md border border-charcoal/15 px-2 py-1 text-xs"
    >
      {OPTIONS.map((o) => (
        <option key={o} value={o}>
          A2P: {o}
        </option>
      ))}
    </select>
  );
}
