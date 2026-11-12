"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

export function SettingsTabs({
  general,
  businessProfile,
}: {
  general: React.ReactNode;
  businessProfile: React.ReactNode;
}) {
  const [tab, setTab] = useState<"general" | "profile">("general");

  return (
    <div>
      <div className="mb-4 flex gap-1 rounded-lg bg-charcoal/5 p-1">
        <button
          type="button"
          onClick={() => setTab("general")}
          className={cn(
            "flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors",
            tab === "general"
              ? "bg-white text-charcoal shadow-sm"
              : "text-charcoal/60",
          )}
        >
          General
        </button>
        <button
          type="button"
          onClick={() => setTab("profile")}
          className={cn(
            "flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors",
            tab === "profile"
              ? "bg-white text-charcoal shadow-sm"
              : "text-charcoal/60",
          )}
        >
          Business Profile
        </button>
      </div>
      <div className={tab === "general" ? "block" : "hidden"}>{general}</div>
      <div className={tab === "profile" ? "block" : "hidden"}>{businessProfile}</div>
    </div>
  );
}
