import { ProspectWorkspace } from "@/components/dashboard/prospect-workspace";
import { serverApiFetch } from "@/lib/server-api";
import { verifySession } from "@/lib/dal";
import type { ApiBuildingOverview, ApiList, ApiProspectDetail, ApiProspectMatch } from "@/lib/dashboard-types";

export const dynamic = "force-dynamic";

export default async function ProspectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await verifySession();
  const [detail, matches, buildings] = await Promise.all([
    serverApiFetch<{ data: ApiProspectDetail }>(`/api/prospects/${id}`),
    serverApiFetch<ApiList<ApiProspectMatch>>(`/api/prospects/matching?prospectId=${id}`),
    serverApiFetch<ApiList<ApiBuildingOverview>>("/api/buildings/overview?limit=100"),
  ]);
  return (
    <div className="flex flex-col gap-6">
      <ProspectWorkspace id={id} initial={detail.data} matches={matches.data} buildings={buildings.data} />
    </div>
  );
}