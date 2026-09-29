import { Wrench } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CreateTicketDialog } from "@/components/dashboard/create-ticket-dialog";
import { PageHeader } from "@/components/dashboard/page-header";
import { RowAction } from "@/components/dashboard/row-action";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { serverApiFetch } from "@/lib/server-api";
import type { ApiBuilding, ApiList, TicketRow } from "@/lib/dashboard-types";
import { formatDate } from "@/lib/dashboard-utils";

export const dynamic = "force-dynamic";

export default async function TicketsPage() {
  const [response, buildings] = await Promise.all([
    serverApiFetch<ApiList<TicketRow>>("/api/tickets?limit=100"),
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
        <Card><CardHeader><CardDescription>En attente</CardDescription><CardTitle>{response.data.filter((row) => row.ticket.status === "pending").length}</CardTitle></CardHeader></Card>
        <Card><CardHeader><CardDescription>En cours</CardDescription><CardTitle>{response.data.filter((row) => row.ticket.status === "in_progress").length}</CardTitle></CardHeader></Card>
        <Card><CardHeader><CardDescription>Résolus</CardDescription><CardTitle>{response.data.filter((row) => row.ticket.status === "resolved").length}</CardTitle></CardHeader></Card>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Tickets</CardTitle>
          <CardDescription>{response.data.length} incident(s) dans votre portefeuille.</CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Incident</TableHead>
                <TableHead>Immeuble</TableHead>
                <TableHead>Priorité</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {response.data.length ? response.data.map((row) => (
                <TableRow key={row.ticket.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span className="flex size-8 items-center justify-center rounded-lg bg-secondary text-secondary-foreground"><Wrench /></span>
                      <div className="min-w-0">
                        <span className="block truncate text-sm font-semibold">{row.ticket.title}</span>
                        <span className="block max-w-56 truncate text-xs text-muted-foreground">{row.ticket.description}</span>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{row.building.name}{row.apartment ? ` · ${row.apartment.unitNumber}` : ""}</TableCell>
                  <TableCell><StatusBadge status={row.ticket.priority} /></TableCell>
                  <TableCell className="text-xs text-muted-foreground">{formatDate(row.ticket.createdAt)}</TableCell>
                  <TableCell><StatusBadge status={row.ticket.status} /></TableCell>
                  <TableCell className="text-right">
                    {row.ticket.status !== "resolved" && (
                      <RowAction
                        endpoint={`/api/tickets/${row.ticket.id}/resolve`}
                        label="Marquer comme résolu"
                        variant="outline"
                        size="sm"
                        confirm
                        confirmTitle="Marquer ce ticket comme résolu ?"
                        successMessage="Ticket résolu."
                      />
                    )}
                  </TableCell>
                </TableRow>
              )) : (
                <TableRow><TableCell colSpan={6} className="h-32 text-center text-sm text-muted-foreground">Aucun incident enregistré.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}