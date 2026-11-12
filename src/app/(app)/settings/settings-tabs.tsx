"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

export type SettingsTab = {
  id: string;
  label: string;
  content: React.ReactNode;
};

export function SettingsTabs({ tabs }: { tabs: SettingsTab[] }) {
  const [active, setActive] = useState(tabs[0]?.id);

  return (
    <div>
      <div className="mb-4 flex gap-1 rounded-lg bg-charcoal/5 p-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setActive(t.id)}
            className={cn(
              "flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              active === t.id ? "bg-white text-charcoal shadow-sm" : "text-charcoal/60",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tabs.map((t) => (
        <div key={t.id} className={active === t.id ? "block" : "hidden"}>
          {t.content}
        </div>
      ))}
    </div>
  );
}
