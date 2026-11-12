import {
  BarChart3,
  CalendarDays,
  FileText,
  Home,
  Inbox,
  type LucideIcon,
  Kanban,
  Megaphone,
  PieChart,
  Receipt,
  Settings,
  HelpCircle,
  ShieldCheck,
  Wrench,
  Zap,
} from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Extra words the search palette matches this page against. */
  keywords?: string[];
};

export type NavGroup = {
  title: string;
  items: NavItem[];
};

export const NAV_GROUPS: NavGroup[] = [
  {
    title: "Main",
    items: [
      { href: "/", label: "Dashboard", icon: Home, keywords: ["home"] },
      { href: "/inbox", label: "Inbox", icon: Inbox, keywords: ["messages", "texts", "sms"] },
      { href: "/leads", label: "Leads", icon: Kanban, keywords: ["pipeline"] },
      { href: "/calendar", label: "Calendar", icon: CalendarDays, keywords: ["schedule"] },
      { href: "/jobs", label: "Jobs", icon: Wrench, keywords: ["work orders"] },
    ],
  },
  {
    title: "Marketing",
    items: [
      { href: "/automations", label: "Automations", icon: Zap, keywords: ["workflows", "funnels"] },
      { href: "/review-blast", label: "Review Blast", icon: Megaphone, keywords: ["csv import"] },
      { href: "/results", label: "Results", icon: BarChart3, keywords: ["dashboard", "stats"] },
    ],
  },
  {
    title: "Money",
    items: [
      { href: "/quotes", label: "Quotes", icon: FileText, keywords: ["estimates"] },
      { href: "/invoices", label: "Invoices", icon: Receipt, keywords: ["billing", "payments"] },
      { href: "/reports", label: "Reports", icon: PieChart, keywords: ["analytics"] },
    ],
  },
];

export const PINNED_NAV_ITEMS: NavItem[] = [
  { href: "/settings", label: "Settings", icon: Settings },
  { href: "/help", label: "Help", icon: HelpCircle, keywords: ["support"] },
];

export const ADMIN_NAV_ITEM: NavItem = {
  href: "/admin",
  label: "Admin",
  icon: ShieldCheck,
  keywords: ["all clients", "client switcher"],
};

export const ALL_PAGE_NAV_ITEMS: NavItem[] = [
  ...NAV_GROUPS.flatMap((g) => g.items),
  ...PINNED_NAV_ITEMS,
  ADMIN_NAV_ITEM,
];
