import { cookies } from "next/headers";
import { AppShell } from "@/components/shell/app-shell";
import { QuickAdd } from "@/components/shell/quick-add";
import { SupportButton } from "@/components/shell/support-button";
import { PwaRegister } from "@/components/shell/pwa-register";
import { AdminBanner } from "@/components/shell/admin-banner";
import { requireMembership } from "@/lib/auth/session";
import { getTradePreset } from "@/lib/trade-presets";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { client, user, isAdmin, viewingAs } = await requireMembership();
  const cookieStore = await cookies();
  const initialCollapsed = cookieStore.get("sidebar_collapsed")?.value === "1";
  const labels = getTradePreset(client?.trade ?? "other").labels;

  return (
    <div className="text-charcoal">
      <AppShell
        businessName={client?.business_name ?? null}
        logoUrl={client?.logo_url ?? null}
        email={user.email ?? null}
        isAdmin={isAdmin}
        jobsLabel={labels.jobNounPlural}
        initialCollapsed={initialCollapsed}
      >
        {viewingAs ? (
          <AdminBanner businessName={client?.business_name ?? null} />
        ) : null}
        {children}
      </AppShell>
      <PwaRegister />
      <SupportButton />
      <QuickAdd />
    </div>
  );
}
