import { Suspense } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { CreateTicketDialog } from "@/components/dashboard/create-ticket-dialog";
import { ListControls } from "@/components/dashboard/list-controls";
import { ButtonSkeleton, KpiGridSkeleton, ListControlsSkeleton, TableCardSkeleton } from "@/components/dashboard/skeletons";
import { PageHeader } from "@/components/dashboard/page-header";
import { ticketColumns } from "./columns";
import { serverApiFetch } from "@/lib/server-api";
import { requireDashboardUser } from "@/lib/dashboard-guard";
import type { ApiBuilding, ApiList, TicketRow, TicketSummary } from "@/lib/dashboard-types";

export const dynamic = "force-dynamic";

export default async function TicketsPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string; status?: string; priority?: string }> }) {
  const params = await searchParams;
  const q = params.q ?? "";
  const page = Number(params.page ?? "1") || 1;
  const status = params.status ?? "";
  const priority = params.priority ?? "";
  const limit = 20;
  await requireDashboardUser();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Suivi des travaux"
        title="Incidents & travaux"
        description="Suivez chaque ticket de la déclaration à la résolution."
        action={
          <Suspense fallback={<ButtonSkeleton className="h-10 w-48" />}>
            <TicketDialogAction />
          </Suspense>
        }
      />
      <Suspense fallback={<>
        <KpiGridSkeleton count={3} />
        <ListControlsSkeleton />
        <TableCardSkeleton title="Tickets" rows={8} columns={6} />
      </>}>
        <TicketsSection q={q} page={page} limit={limit} status={status} priority={priority} />
      </Suspense>
    </div>
  );
}

async function TicketDialogAction() {
  const buildings = await serverApiFetch<ApiList<ApiBuilding>>("/api/buildings?limit=100");
  const buildingOptions = buildings.data.map((building) => ({ value: building.id, label: building.name }));
  return <CreateTicketDialog buildings={buildingOptions} />;
}

async function TicketsSection({ q, page, limit, status, priority }: { q: string; page: number; limit: number; status: string; priority: string }) {
  const query = new URLSearchParams({ limit: String(limit), page: String(page) });
  if (status) query.set("status", status);
  if (priority) query.set("priority", priority);
  if (q) query.set("q", q);
  const response = await serverApiFetch<ApiList<TicketRow> & { summary: TicketSummary }>(`/api/tickets?${query.toString()}`);
  const total = response.pagination?.total ?? response.data.length;
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-3">
        <Card><CardHeader><CardDescription>En attente</CardDescription><CardTitle>{response.summary.pending}</CardTitle></CardHeader></Card>
        <Card><CardHeader><CardDescription>En cours</CardDescription><CardTitle>{response.summary.inProgress}</CardTitle></CardHeader></Card>
        <Card><CardHeader><CardDescription>Résolus</CardDescription><CardTitle>{response.summary.resolved}</CardTitle></CardHeader></Card>
      </div>
      <ListControls
        query={q}
        page={page}
        limit={limit}
        total={total}
        placeholder="Rechercher un titre, une description…"
        filters={[
          {
            name: "status",
            label: "Statut",
            value: status,
            allLabel: "Tous les statuts",
            options: [
              { value: "pending", label: "En attente" },
              { value: "in_progress", label: "En cours" },
              { value: "resolved", label: "Résolu" },
            ],
          },
          {
            name: "priority",
            label: "Priorité",
            value: priority,
            allLabel: "Toutes les priorités",
            options: [
              { value: "urgent", label: "Urgente" },
              { value: "normal", label: "Normale" },
              { value: "low", label: "Basse" },
            ],
          },
        ]}
      />
      <Card>
        <CardHeader>
          <CardTitle>Tickets</CardTitle>
          <CardDescription>{total} incident(s) dans votre portefeuille.</CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          <DataTable columns={ticketColumns} data={response.data} emptyMessage="Aucun incident enregistré." />
        </CardContent>
      </Card>
    </>
  );
}
