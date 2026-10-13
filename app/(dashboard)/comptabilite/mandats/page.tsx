import { PageHeader } from "@/components/dashboard/page-header";
import { ArrangementsWorkspace } from "@/components/dashboard/accounting/arrangements-workspace";
import { serverApiFetch } from "@/lib/server-api";
import { verifySession } from "@/lib/dal";
import type { ApiList, ApiManagementArrangement } from "@/lib/dashboard-types";

export const dynamic = "force-dynamic";

type BuildingOption = { id: string; name: string };

export default async function ArrangementsPage() {
  await verifySession();
  const [arrangements, buildings] = await Promise.all([
    serverApiFetch<{ data: ApiManagementArrangement[] }>("/api/accounts/arrangements"),
    serverApiFetch<ApiList<BuildingOption>>("/api/buildings?limit=100"),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Comptabilité"
        title="Mandats de gestion"
        description="Fixez la rémunération de l’agence par immeuble. Les relevés propriétaires et la vue comptable appliquent le mandat en vigueur sur la période."
      />
      <ArrangementsWorkspace
        initialArrangements={arrangements.data}
        buildings={buildings.data.map((building) => ({ id: building.id, name: building.name }))}
      />
    </div>
  );
}
