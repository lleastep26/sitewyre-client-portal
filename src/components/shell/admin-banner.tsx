import { clearAdminViewClient } from "@/app/admin/actions";

export function AdminBanner({
  businessName,
}: {
  businessName: string | null;
}) {
  return (
    <div className="mx-4 mb-3 flex items-center justify-between rounded-lg bg-copper/10 px-3 py-2 text-xs text-copper">
      <span className="truncate">
        Viewing as {businessName ?? "client"} (admin)
      </span>
      <form action={clearAdminViewClient}>
        <button type="submit" className="shrink-0 font-medium underline">
          Switch
        </button>
      </form>
    </div>
  );
}
