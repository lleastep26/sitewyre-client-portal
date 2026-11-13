"use client";

import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { ChevronsLeft, ChevronsRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { SidebarNav } from "./sidebar-nav";
import { Topbar } from "./topbar";

const COLLAPSE_COOKIE = "sidebar_collapsed";

function persistCollapsed(value: boolean) {
  document.cookie = `${COLLAPSE_COOKIE}=${value ? "1" : "0"}; path=/; max-age=31536000; SameSite=Lax`;
}

export function AppShell({
  businessName,
  logoUrl,
  email,
  isAdmin,
  jobsLabel,
  initialCollapsed,
  children,
}: {
  businessName: string | null;
  logoUrl: string | null;
  email: string | null;
  isAdmin: boolean;
  jobsLabel?: string;
  initialCollapsed: boolean;
  children: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const [mobileOpen, setMobileOpen] = useState(false);

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      persistCollapsed(next);
      return next;
    });
  }

  return (
    <div className="flex h-dvh overflow-hidden">
      <aside
        className={cn(
          "hidden shrink-0 flex-col bg-charcoal transition-[width] duration-200 lg:flex",
          collapsed ? "w-[72px]" : "w-60",
        )}
      >
        <div className="flex h-16 shrink-0 items-center justify-center border-b border-white/10 px-2">
          <span className="truncate font-display text-lg text-cream">
            {collapsed ? "S" : "Sitewyre"}
          </span>
        </div>
        <div className="min-h-0 flex-1">
          <SidebarNav collapsed={collapsed} isAdmin={isAdmin} jobsLabel={jobsLabel} />
        </div>
        <button
          type="button"
          onClick={toggleCollapsed}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="flex h-12 shrink-0 items-center justify-center gap-2 border-t border-white/10 text-cream/60 hover:bg-white/5 hover:text-cream"
        >
          {collapsed ? (
            <ChevronsRight className="h-4 w-4" />
          ) : (
            <>
              <ChevronsLeft className="h-4 w-4" />
              <span className="text-xs">Collapse</span>
            </>
          )}
        </button>
      </aside>

      <Dialog.Root open={mobileOpen} onOpenChange={setMobileOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-charcoal/50 lg:hidden" />
          <Dialog.Content
            className="fixed inset-y-0 left-0 z-50 flex w-72 max-w-[80vw] flex-col bg-charcoal shadow-xl outline-none lg:hidden"
            aria-describedby={undefined}
          >
            <Dialog.Title className="sr-only">Menu</Dialog.Title>
            <div className="flex h-16 shrink-0 items-center px-4">
              <span className="font-display text-lg text-cream">Sitewyre</span>
            </div>
            <div className="min-h-0 flex-1">
              <SidebarNav
                collapsed={false}
                isAdmin={isAdmin}
                jobsLabel={jobsLabel}
                onNavigate={() => setMobileOpen(false)}
              />
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          businessName={businessName}
          logoUrl={logoUrl}
          email={email}
          onMenuClick={() => setMobileOpen(true)}
        />
        <main className="flex-1 overflow-y-auto bg-cream">
          <div className="mx-auto w-full max-w-lg pb-24 pt-4">{children}</div>
        </main>
      </div>
    </div>
  );
}
