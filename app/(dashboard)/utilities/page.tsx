import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { CreateUtilityDialog } from "@/components/dashboard/create-utility-dialog";
import { ListControls } from "@/components/dashboard/list-controls";
import { PageHeader } from "@/components/dashboard/page-header";
import { utilityColumns } from "./columns";
import { serverApiFetch } from "@/lib/server-api";
import { requireDashboardUser } from "@/lib/dashboard-guard";
import type { UtilitiesOverviewResponse } from "@/lib/dashboard-types";

export const dynamic = "force-dynamic";

export default async function UtilitiesPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  const params = await searchParams;
  const q = params.q ?? "";
  const page = Number(params.page ?? "1") || 1;
  const limit = 25;
  await requireDashboardUser();
  const response = await serverApiFetch<UtilitiesOverviewResponse>(`/api/utilities/overview?limit=${limit}&page=${page}${q ? `&q=${encodeURIComponent(q)}` : ""}`);
  const invoices = response.data.invoices;
  const total = response.pagination?.total ?? invoices.length;
  const buildingOptions = response.data.buildings.map((building) => ({ value: building.id, label: building.name }));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Charges"
        title="Factures communes"
        description="Répartissez automatiquement les charges entre les unités."
        action={<CreateUtilityDialog buildings={buildingOptions} />}
      />
      <ListControls query={q} page={page} limit={limit} total={total} placeholder="Rechercher un immeuble, fournisseur, période…" />
      <Card>
        <CardHeader>
          <CardTitle>Factures récentes</CardTitle>
          <CardDescription>{total} facture(s) enregistrée(s).</CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          <DataTable columns={utilityColumns} data={invoices} emptyMessage="Aucune facture commune enregistrée." />
        </CardContent>
      </Card>
    </div>
  );
}