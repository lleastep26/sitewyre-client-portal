"use client";

import { Menu } from "lucide-react";
import { SearchPalette } from "./search-palette";
import { ProfileMenu } from "./profile-menu";

export function Topbar({
  businessName,
  email,
  onMenuClick,
}: {
  businessName: string | null;
  email: string | null;
  onMenuClick: () => void;
}) {
  const initial = (businessName ?? "S").trim().charAt(0).toUpperCase() || "S";

  return (
    <header className="flex h-16 shrink-0 items-center gap-3 border-b border-charcoal/10 bg-white px-4">
      <button
        type="button"
        onClick={onMenuClick}
        aria-label="Open menu"
        className="-ml-1 flex h-9 w-9 items-center justify-center rounded-lg text-charcoal hover:bg-charcoal/5 lg:hidden"
      >
        <Menu className="h-5 w-5" />
      </button>

      <div className="flex min-w-0 items-center gap-2">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-copper text-sm font-semibold text-white">
          {initial}
        </span>
        <span className="truncate font-display text-base text-charcoal">
          {businessName ?? "Sitewyre"}
        </span>
      </div>

      <div className="flex flex-1 justify-center px-2">
        <SearchPalette />
      </div>

      <ProfileMenu email={email} />
    </header>
  );
}
