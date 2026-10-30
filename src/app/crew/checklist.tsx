"use client";

import { useTransition } from "react";
import { toggleChecklistItem } from "@/app/(app)/jobs/actions";

export function CrewChecklist({
  jobId,
  checklist,
}: {
  jobId: string;
  checklist: { id: string; label: string; done: boolean }[];
}) {
  const [pending, start] = useTransition();
  return (
    <ul className="mt-3 space-y-1">
      {checklist.map((item) => (
        <li key={item.id} className="flex items-center gap-2 text-sm">
          <button
            type="button"
            disabled={pending}
            className="h-6 w-6 rounded border border-charcoal/20"
            onClick={() =>
              start(() => {
                void toggleChecklistItem({
                  jobId,
                  itemId: item.id,
                  done: !item.done,
                });
              })
            }
          >
            {item.done ? "✓" : ""}
          </button>
          {item.label}
        </li>
      ))}
    </ul>
  );
}
