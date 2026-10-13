import { SettingsNav } from "@/components/dashboard/settings-nav";
import { verifySession } from "@/lib/dal";

export const dynamic = "force-dynamic";

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  await verifySession();
  return (
    <div className="flex flex-col gap-6">
      <SettingsNav />
      {children}
    </div>
  );
}
