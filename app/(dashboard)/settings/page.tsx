import { PageHeader } from "@/components/dashboard/page-header";
import { AccountSettings } from "@/components/dashboard/account-settings";
import { requireDashboardUser } from "@/lib/dashboard-guard";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await requireDashboardUser();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader eyebrow="Compte" title="Paramètres" description="Votre profil, votre mot de passe et votre session." />
      <AccountSettings user={user} />
    </div>
  );
}
