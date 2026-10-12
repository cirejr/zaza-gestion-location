import { PageHeader } from "@/components/dashboard/page-header";
import { OrganizationSettings } from "@/components/dashboard/organization-settings";
import { requireDashboardUser } from "@/lib/dashboard-guard";
import { serverApiFetch } from "@/lib/server-api";
import type { ApiOrganizationDetail } from "@/lib/dashboard-types";

export const dynamic = "force-dynamic";

export default async function OrganizationSettingsPage() {
  const user = await requireDashboardUser();
  const response = await serverApiFetch<{ data: ApiOrganizationDetail }>("/api/organization");
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Agence"
        title="Configuration de l’agence"
        description={user.role === "owner" ? "Votre identité, vos coordonnées et votre barème de gestion par défaut." : "Les informations de votre agence. Seul le propriétaire peut les modifier."}
      />
      <OrganizationSettings organization={response.data} canEdit={user.role === "owner"} />
    </div>
  );
}
