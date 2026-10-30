import { BottomNav } from "@/components/shell/bottom-nav";
import { QuickAdd } from "@/components/shell/quick-add";
import { SupportButton } from "@/components/shell/support-button";
import { PwaRegister } from "@/components/shell/pwa-register";
import { requireMembership } from "@/lib/auth/session";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireMembership();

  return (
    <div className="min-h-dvh bg-[radial-gradient(ellipse_at_top,_#fbf7f2,_#f0e8dc_50%,_#e8dccb)] text-charcoal">
      <div className="mx-auto min-h-dvh w-full max-w-lg pb-24 pt-4">
        {children}
      </div>
      <PwaRegister />
      <SupportButton />
      <QuickAdd />
      <BottomNav />
    </div>
  );
}
