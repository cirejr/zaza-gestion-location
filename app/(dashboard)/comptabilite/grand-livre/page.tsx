import { PageHeader } from "@/components/dashboard/page-header";
import { LedgerWorkspace } from "@/components/dashboard/accounting/ledger-workspace";
import { requireDashboardUser } from "@/lib/dashboard-guard";
import { serverApiFetch } from "@/lib/server-api";
import type { ApiFinancialAccountWithBalance, ApiList } from "@/lib/dashboard-types";

export const dynamic = "force-dynamic";

type BuildingOption = { id: string; name: string };

export default async function LedgerPage() {
  await requireDashboardUser();
  const [accounts, buildings] = await Promise.all([
    serverApiFetch<{ data: ApiFinancialAccountWithBalance[] }>("/api/accounts"),
    serverApiFetch<ApiList<BuildingOption>>("/api/buildings?limit=100"),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Comptabilité"
        title="Grand livre"
        description="Comptes, encaissements, dépenses, virements et extournes. Chaque mouvement est tracé, jamais réécrit."
      />
      <LedgerWorkspace initialAccounts={accounts.data} buildings={buildings.data.map((building) => ({ id: building.id, name: building.name }))} />
    </div>
  );
}
