import { PageHeader } from "@/components/dashboard/page-header";
import { StatementsWorkspace } from "@/components/dashboard/accounting/statements-workspace";
import { requireDashboardUser } from "@/lib/dashboard-guard";
import { serverApiFetch } from "@/lib/server-api";
import type { ApiFinancialAccountWithBalance, ApiList, ApiOwnerSettlement, ApiOwnerStatement } from "@/lib/dashboard-types";

export const dynamic = "force-dynamic";

type BuildingOption = { id: string; name: string };

export default async function StatementsPage() {
  await requireDashboardUser();
  const [statements, settlements, accounts, buildings] = await Promise.all([
    serverApiFetch<{ data: ApiOwnerStatement[] }>("/api/accounts/statements"),
    serverApiFetch<{ data: ApiOwnerSettlement[] }>("/api/accounts/settlements"),
    serverApiFetch<{ data: ApiFinancialAccountWithBalance[] }>("/api/accounts"),
    serverApiFetch<ApiList<BuildingOption>>("/api/buildings?limit=100"),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Comptabilité"
        title="Relevés propriétaires"
        description="Calculez ce qui est dû à chaque propriétaire à partir du grand livre, puis enregistrez les versements."
      />
      <StatementsWorkspace
        initialStatements={statements.data}
        initialSettlements={settlements.data}
        accounts={accounts.data.map((account) => ({ id: account.id, name: account.name }))}
        buildings={buildings.data.map((building) => ({ id: building.id, name: building.name }))}
      />
    </div>
  );
}
