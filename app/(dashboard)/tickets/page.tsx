import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { CreateTicketDialog } from "@/components/dashboard/create-ticket-dialog";
import { PageHeader } from "@/components/dashboard/page-header";
import { ticketColumns } from "./columns";
import { serverApiFetch } from "@/lib/server-api";
import { requireDashboardUser } from "@/lib/dashboard-guard";
import type { ApiBuilding, ApiList, TicketRow, TicketSummary } from "@/lib/dashboard-types";

export const dynamic = "force-dynamic";

export default async function TicketsPage() {
  await requireDashboardUser();
  const [response, buildings] = await Promise.all([
    serverApiFetch<ApiList<TicketRow> & { summary: TicketSummary }>("/api/tickets?limit=100"),
    serverApiFetch<ApiList<ApiBuilding>>("/api/buildings?limit=100"),
  ]);

  const buildingOptions = buildings.data.map((building) => ({ value: building.id, label: building.name }));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Suivi des travaux"
        title="Incidents & travaux"
        description="Suivez chaque ticket de la déclaration à la résolution."
        action={<CreateTicketDialog buildings={buildingOptions} />}
      />
      <div className="grid gap-4 sm:grid-cols-3">
        <Card><CardHeader><CardDescription>En attente</CardDescription><CardTitle>{response.summary.pending}</CardTitle></CardHeader></Card>
        <Card><CardHeader><CardDescription>En cours</CardDescription><CardTitle>{response.summary.inProgress}</CardTitle></CardHeader></Card>
        <Card><CardHeader><CardDescription>Résolus</CardDescription><CardTitle>{response.summary.resolved}</CardTitle></CardHeader></Card>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Tickets</CardTitle>
          <CardDescription>{response.pagination?.total ?? response.data.length} incident(s) dans votre portefeuille.</CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          <DataTable columns={ticketColumns} data={response.data} emptyMessage="Aucun incident enregistré." />
        </CardContent>
      </Card>
    </div>
  );
}