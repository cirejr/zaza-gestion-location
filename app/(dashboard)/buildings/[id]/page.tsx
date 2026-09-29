import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CreateApartmentDialog } from "@/components/dashboard/create-apartment-dialog";
import { PageHeader } from "@/components/dashboard/page-header";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { serverApiFetch } from "@/lib/server-api";
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

  let building: ApiBuilding;
  try {
    building = (await serverApiFetch<{ data: ApiBuilding }>(`/api/buildings/${id}`)).data;
  } catch {
    notFound();
  }
  const response = await serverApiFetch<ApiList<ApiApartment>>(
    `/api/buildings/${id}/apartments?limit=${limit}&page=${page}${q ? `&q=${encodeURIComponent(q)}` : ""}`,
  );
  const total = response.pagination?.total ?? response.data.length;
  const occupied = response.data.filter((apartment) => apartment.status === "occupied").length;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Button render={<Link href="/buildings" />} variant="ghost" size="sm" className="-ml-2">
          <ArrowLeft data-icon="inline-start" />Tous les immeubles
        </Button>
      </div>
      <PageHeader
        eyebrow="Pilotage"
        title={building.name}
        description={[building.address, building.city, building.country].filter(Boolean).join(" · ")}
        action={<CreateApartmentDialog buildingId={id} buildingName={building.name} />}
      />
      <div className="grid gap-4 sm:grid-cols-3">
        <Card><CardHeader><CardDescription>Unités</CardDescription><CardTitle>{total}</CardTitle></CardHeader></Card>
        <Card><CardHeader><CardDescription>Occupées</CardDescription><CardTitle>{occupied}</CardTitle></CardHeader></Card>
        <Card><CardHeader><CardDescription>Loyers mensuels</CardDescription><CardTitle>{formatCfa(response.data.reduce((sum, apartment) => sum + Number(apartment.rentAmount), 0))}</CardTitle></CardHeader></Card>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Unités de {building.name}</CardTitle>
          <CardDescription>Statuts, loyers et surfaces.</CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          {response.data.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Unité</TableHead>
                  <TableHead>Étage</TableHead>
                  <TableHead>Pièces</TableHead>
                  <TableHead>Surface</TableHead>
                  <TableHead>Loyer</TableHead>
                  <TableHead>Statut</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {response.data.map((apartment) => (
                  <TableRow key={apartment.id}>
                    <TableCell className="text-sm font-semibold">{apartment.unitNumber}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{apartment.floor != null ? `${apartment.floor}` : "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{apartment.bedrooms}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{apartment.areaSqm ? `${apartment.areaSqm} m²` : "—"}</TableCell>
                    <TableCell className="text-sm font-bold">{formatCfa(apartment.rentAmount)}</TableCell>
                    <TableCell><StatusBadge status={apartment.status} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
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
    </div>
  );
}