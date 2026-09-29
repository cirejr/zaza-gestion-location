import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { DataTable } from "@/components/ui/data-table";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { CreateApartmentDialog } from "@/components/dashboard/create-apartment-dialog";
import { ListControls } from "@/components/dashboard/list-controls";
import { KpiGridSkeleton, ListControlsSkeleton, TableCardSkeleton } from "@/components/dashboard/skeletons";
import { PageHeader } from "@/components/dashboard/page-header";
import { apartmentColumns } from "./columns";
import { cachedServerApiFetch, serverApiFetch } from "@/lib/server-api";
import { requireDashboardUser } from "@/lib/dashboard-guard";
import type { ApiApartment, ApiBuilding, ApiList } from "@/lib/dashboard-types";
import { formatCfa } from "@/lib/dashboard-utils";

export const dynamic = "force-dynamic";

export default async function BuildingDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ q?: string; page?: string }> }) {
  const [{ id }, queryParams] = await Promise.all([params, searchParams]);
  const q = queryParams.q ?? "";
  const page = Number(queryParams.page ?? "1") || 1;
  const limit = 20;
  await requireDashboardUser();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Button render={<Link href="/buildings" />} variant="ghost" size="sm" className="-ml-2">
          <ArrowLeft data-icon="inline-start" />Tous les immeubles
        </Button>
      </div>
      <Suspense
        fallback={
          <div className="flex flex-col gap-2">
            <Skeleton className="h-3 w-28" />
            <div className="flex items-start justify-between gap-4">
              <div className="flex flex-col gap-2">
                <Skeleton className="h-8 w-64" />
                <Skeleton className="h-4 w-96 max-w-full" />
              </div>
              <Skeleton className="h-10 w-48 rounded-md" />
            </div>
          </div>
        }
      >
        <BuildingHeader id={id} />
      </Suspense>
      <Suspense
        fallback={
          <>
            <KpiGridSkeleton count={3} />
            <ListControlsSkeleton />
            <TableCardSkeleton title="Unités" rows={8} columns={6} />
          </>
        }
      >
        <BuildingUnitsSection id={id} q={q} page={page} limit={limit} />
      </Suspense>
    </div>
  );
}

async function BuildingHeader({ id }: { id: string }) {
  let building: ApiBuilding;
  try {
    building = (await cachedServerApiFetch<{ data: ApiBuilding }>(`/api/buildings/${id}`)).data;
  } catch {
    notFound();
  }
  return (
    <PageHeader
      eyebrow="Pilotage"
      title={building.name}
      description={[building.address, building.city, building.country].filter(Boolean).join(" · ")}
      action={<CreateApartmentDialog buildingId={id} buildingName={building.name} />}
    />
  );
}

async function BuildingUnitsSection({ id, q, page, limit }: { id: string; q: string; page: number; limit: number }) {
  const [response, building] = await Promise.all([
    serverApiFetch<ApiList<ApiApartment>>(
      `/api/buildings/${id}/apartments?limit=${limit}&page=${page}${q ? `&q=${encodeURIComponent(q)}` : ""}`,
    ),
    cachedServerApiFetch<{ data: ApiBuilding }>(`/api/buildings/${id}`),
  ]);
  const total = response.pagination?.total ?? response.data.length;
  const occupied = response.data.filter((apartment) => apartment.status === "occupied").length;
  const buildingName = building.data.name;

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-3">
        <Card><CardHeader><CardDescription>Unités</CardDescription><CardTitle>{total}</CardTitle></CardHeader></Card>
        <Card><CardHeader><CardDescription>Occupées</CardDescription><CardTitle>{occupied}</CardTitle></CardHeader></Card>
        <Card><CardHeader><CardDescription>Loyers mensuels</CardDescription><CardTitle>{formatCfa(response.data.reduce((sum, apartment) => sum + Number(apartment.rentAmount), 0))}</CardTitle></CardHeader></Card>
      </div>
      <ListControls query={q} page={page} limit={limit} total={total} placeholder="Rechercher une unité…" />
      <Card>
        <CardHeader>
          <CardTitle>Unités de {buildingName}</CardTitle>
          <CardDescription>Statuts, loyers et surfaces.</CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          {response.data.length ? (
            <DataTable columns={apartmentColumns} data={response.data} />
          ) : (
            <Empty className="border">
              <EmptyMedia variant="icon"><Building2 /></EmptyMedia>
              <EmptyHeader>
                <EmptyTitle>Aucune unité dans cet immeuble</EmptyTitle>
                <EmptyDescription>Ajoutez votre première unité pour rattacher un bail et un locataire.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </CardContent>
      </Card>
    </>
  );
}