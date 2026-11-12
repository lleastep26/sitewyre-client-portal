"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  ADMIN_NAV_ITEM,
  NAV_GROUPS,
  PINNED_NAV_ITEMS,
  type NavItem,
} from "./nav-config";

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

function NavLink({
  item,
  active,
  collapsed,
  onNavigate,
}: {
  item: NavItem;
  active: boolean;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      title={collapsed ? item.label : undefined}
      className={cn(
        "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
        collapsed && "justify-center px-2",
        active
          ? "bg-copper text-white"
          : "text-cream/70 hover:bg-white/10 hover:text-cream",
      )}
    >
      <Icon className="h-5 w-5 shrink-0" />
      {collapsed ? null : <span className="truncate">{item.label}</span>}
    </Link>
  );
}

export function SidebarNav({
  collapsed,
  isAdmin,
  onNavigate,
}: {
  collapsed: boolean;
  isAdmin: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();

  return (
    <nav className="flex h-full flex-col gap-4 overflow-y-auto px-2 py-4">
      <div className="flex-1 space-y-5">
        {NAV_GROUPS.map((group) => (
          <div key={group.title}>
            {collapsed ? null : (
              <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-cream/40">
                {group.title}
              </p>
            )}
            <div className="space-y-0.5">
              {group.items.map((item) => (
                <NavLink
                  key={item.href}
                  item={item}
                  active={isActive(pathname, item.href)}
                  collapsed={collapsed}
                  onNavigate={onNavigate}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="space-y-0.5 border-t border-white/10 pt-3">
        {PINNED_NAV_ITEMS.map((item) => (
          <NavLink
            key={item.href}
            item={item}
            active={isActive(pathname, item.href)}
            collapsed={collapsed}
            onNavigate={onNavigate}
          />
        ))}
        {isAdmin ? (
          <NavLink
            item={ADMIN_NAV_ITEM}
            active={isActive(pathname, ADMIN_NAV_ITEM.href)}
            collapsed={collapsed}
            onNavigate={onNavigate}
          />
        ) : null}
      </div>
    </nav>
  );
}
