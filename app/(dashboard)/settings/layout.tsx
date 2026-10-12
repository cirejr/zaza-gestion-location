import { SettingsNav } from "@/components/dashboard/settings-nav";
import { requireDashboardUser } from "@/lib/dashboard-guard";

export const dynamic = "force-dynamic";

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  await requireDashboardUser();
  return (
    <div className="flex flex-col gap-6">
      <SettingsNav />
      {children}
    </div>
  );
}
