import { Suspense } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { ListControls } from "@/components/dashboard/list-controls";
import { ListControlsSkeleton, TableCardSkeleton } from "@/components/dashboard/skeletons";
import { PageHeader } from "@/components/dashboard/page-header";
import { CreateProspectDialog } from "@/components/dashboard/create-prospect-dialog";
import { prospectColumns } from "./columns";
import { serverApiFetch } from "@/lib/server-api";
import { requireDashboardUser } from "@/lib/dashboard-guard";
import type { ApiList, ApiProspect } from "@/lib/dashboard-types";

export const dynamic = "force-dynamic";

const propertyTypeOptions = [
  { value: "studio", label: "Studio" },
  { value: "chambre", label: "Chambre" },
  { value: "apartment", label: "Appartement" },
  { value: "house", label: "Maison" },
  { value: "commercial", label: "Local commercial" },
  { value: "other", label: "Autre" },
];

const statusOptions = [
  { value: "new", label: "Nouveau" },
  { value: "contacted", label: "Contacté" },
  { value: "notified", label: "Notifié" },
  { value: "visit_scheduled", label: "Visite prévue" },
  { value: "visited", label: "Visité" },
  { value: "negotiation", label: "Négociation" },
  { value: "converted", label: "Converti" },
  { value: "lost", label: "Perdu" },
];

export default async function ProspectsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string; status?: string; propertyType?: string; location?: string; budgetMin?: string; budgetMax?: string; moveInDate?: string }>;
}) {
  const params = await searchParams;
  const q = params.q ?? "";
  const page = Number(params.page ?? "1") || 1;
  const status = params.status ?? "";
  const propertyType = params.propertyType ?? "";
  const location = params.location ?? "";
  const budgetMin = params.budgetMin ?? "";
  const budgetMax = params.budgetMax ?? "";
  const moveInDate = params.moveInDate ?? "";
  const limit = 20;
  await requireDashboardUser();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Acquisition"
        title="Prospects & locations"
        description="Suivez les personnes qui cherchent un logement, planifiez les visites et convertissez-les en locataires."
        action={<CreateProspectDialog />}
      />
      <Suspense fallback={<>
        <ListControlsSkeleton />
        <TableCardSkeleton title="Prospects" rows={8} columns={7} />
      </>}>
        <ProspectsSection
          q={q}
          page={page}
          limit={limit}
          status={status}
          propertyType={propertyType}
          location={location}
          budgetMin={budgetMin}
          budgetMax={budgetMax}
          moveInDate={moveInDate}
        />
      </Suspense>
    </div>
  );
}

async function ProspectsSection({
  q,
  page,
  limit,
  status,
  propertyType,
  location,
  budgetMin,
  budgetMax,
  moveInDate,
}: {
  q: string;
  page: number;
  limit: number;
  status: string;
  propertyType: string;
  location: string;
  budgetMin: string;
  budgetMax: string;
  moveInDate: string;
}) {
  const query = new URLSearchParams({ limit: String(limit), page: String(page) });
  if (status) query.set("status", status);
  if (propertyType) query.set("propertyType", propertyType);
  if (q) query.set("q", q);
  if (location) query.set("location", location);
  if (budgetMin) query.set("budgetMin", budgetMin);
  if (budgetMax) query.set("budgetMax", budgetMax);
  if (moveInDate) query.set("moveInDate", moveInDate);
  const response = await serverApiFetch<ApiList<ApiProspect>>(`/api/prospects?${query.toString()}`);
  const total = response.pagination?.total ?? response.data.length;
  return (
    <>
      <ListControls
        query={q}
        page={page}
        limit={limit}
        total={total}
        placeholder="Rechercher un nom, un numéro, un secteur…"
        filters={[
          {
            name: "status",
            label: "Statut",
            value: status,
            allLabel: "Tous les statuts",
            options: statusOptions,
          },
          {
            name: "propertyType",
            label: "Type",
            value: propertyType,
            allLabel: "Tous les types",
            options: propertyTypeOptions,
          },
          {
            name: "location",
            label: "Secteur",
            type: "text",
            value: location,
            placeholder: "Secteur souhaité",
          },
          {
            name: "budgetMin",
            label: "Budget min",
            type: "number",
            value: budgetMin,
            placeholder: "Budget min (F)",
          },
          {
            name: "budgetMax",
            label: "Budget max",
            type: "number",
            value: budgetMax,
            placeholder: "Budget max (F)",
          },
          {
            name: "moveInDate",
            label: "Emménagement",
            type: "date",
            value: moveInDate,
          },
        ]}
      />
      <Card>
        <CardHeader>
          <CardTitle>Prospects</CardTitle>
          <CardDescription>{total} prospect(s) dans votre équipe.</CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          <DataTable columns={prospectColumns} data={response.data} emptyMessage="Aucun prospect enregistré." />
        </CardContent>
      </Card>
    </>
  );
}