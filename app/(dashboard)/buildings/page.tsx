import Link from "next/link";
import { Building2, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Separator } from "@/components/ui/separator";
import { CreateBuildingDialog } from "@/components/dashboard/create-building-dialog";
import { ListControls } from "@/components/dashboard/list-controls";
import { PageHeader } from "@/components/dashboard/page-header";
import { unitOverviewColumns } from "./columns";
import { serverApiFetch } from "@/lib/server-api";
import { requireDashboardUser } from "@/lib/dashboard-guard";
import type { ApiBuildingOverview, ApiList } from "@/lib/dashboard-types";
import { formatCfa } from "@/lib/dashboard-utils";

export const dynamic = "force-dynamic";

export default async function BuildingsPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string; limit?: string }> }) {
  const params = await searchParams;
  const q = params.q ?? "";
  const page = Number(params.page ?? "1") || 1;
  const limit = Number(params.limit ?? "12") || 12;
  await requireDashboardUser();
  const response = await serverApiFetch<ApiList<ApiBuildingOverview>>(
    `/api/buildings/overview?limit=${limit}&page=${page}${q ? `&q=${encodeURIComponent(q)}` : ""}`,
  );
  const total = response.pagination?.total ?? response.data.length;
  const apartmentGroups = response.data.map((building) => ({ building, apartments: building.apartments }));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Pilotage"
        title="Immeubles & unités"
        description="Gérez vos adresses, unités et statuts depuis un seul endroit."
        action={<CreateBuildingDialog />}
      />
      <ListControls query={q} page={page} limit={limit} total={total} placeholder="Rechercher un immeuble…" />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {apartmentGroups.length ? apartmentGroups.map(({ building, apartments }) => {
          const occupied = apartments.filter((apartment) => apartment.status === "occupied").length;
          return (
            <Card key={building.id} className="overflow-hidden">
              <div className="h-2 bg-primary" />
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle>{building.name}</CardTitle>
                    <CardDescription className="mt-1">{building.address}</CardDescription>
                  </div>
                  <span className="flex size-9 items-center justify-center rounded-xl bg-secondary text-secondary-foreground"><Building2 /></span>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">{occupied}/{building.unitCount} occupées</Badge>
                  <Badge variant="outline">{apartments.length} unités</Badge>
                </div>
                <Separator className="my-4" />
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Loyers mensuels estimés</span>
                  <span className="font-bold text-foreground">{formatCfa(apartments.reduce((sum, apartment) => sum + Number(apartment.rentAmount), 0))}</span>
                </div>
                <Button render={<Link href={`/buildings/${building.id}`} />} variant="outline" className="mt-4 w-full">
                  Voir les unités<ChevronRight data-icon="inline-end" />
                </Button>
              </CardContent>
            </Card>
          );
        }) : (
          <Empty className="col-span-full border">
            <EmptyMedia variant="icon"><Building2 /></EmptyMedia>
            <EmptyHeader>
              <EmptyTitle>Aucun immeuble enregistré</EmptyTitle>
              <EmptyDescription>Ajoutez votre premier immeuble pour commencer à gérer vos unités et loyers.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Unités</CardTitle>
          <CardDescription>Statuts et loyers des appartements.</CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          <DataTable
            columns={unitOverviewColumns}
            data={apartmentGroups.flatMap(({ building, apartments }) => apartments.map((apartment) => ({ apartment, building })))}
            emptyMessage="Ajoutez des unités dans vos immeubles pour les voir ici."
          />
        </CardContent>
      </Card>
    </div>
  );
}