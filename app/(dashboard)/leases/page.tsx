import { Suspense } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { CreateLeaseDialog } from "@/components/dashboard/create-lease-dialog";
import { ListControls } from "@/components/dashboard/list-controls";
import { ButtonSkeleton, ListControlsSkeleton, TableCardSkeleton } from "@/components/dashboard/skeletons";
import { PageHeader } from "@/components/dashboard/page-header";
import { leaseColumns } from "./columns";
import { serverApiFetch } from "@/lib/server-api";
import { requireDashboardUser } from "@/lib/dashboard-guard";
import type { ApiApartment, ApiList, ApiTenant, LeaseRow } from "@/lib/dashboard-types";
import { formatCfa } from "@/lib/dashboard-utils";

/** Apartment rows returned by the purpose-built `/api/leases/options` route. */
type LeaseOptionApartment = ApiApartment & { buildingName: string };

export const dynamic = "force-dynamic";

export default async function LeasesPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string; status?: string }> }) {
  const params = await searchParams;
  const q = params.q ?? "";
  const page = Number(params.page ?? "1") || 1;
  const status = params.status ?? "";
  const limit = 20;
  await requireDashboardUser();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Documents"
        title="Baux"
        description="Contrats, caution et périodes de location."
        action={
          <Suspense fallback={<ButtonSkeleton className="h-10 w-52" />}>
            <LeaseDialogAction />
          </Suspense>
        }
      />
      <Suspense fallback={<>
        <ListControlsSkeleton />
        <TableCardSkeleton title="Contrats de location" rows={8} columns={6} />
      </>}>
        <LeasesSection q={q} page={page} limit={limit} status={status} />
      </Suspense>
    </div>
  );
}

async function LeaseDialogAction() {
  const options = await serverApiFetch<{ data: { apartments: LeaseOptionApartment[]; tenants: ApiTenant[] } }>("/api/leases/options");
  const apartmentOptions = options.data.apartments.map((apartment) => ({
    value: apartment.id,
    label: `${apartment.buildingName} · ${apartment.unitNumber} — ${formatCfa(apartment.rentAmount)}/mois${apartment.status === "occupied" ? " (occupée)" : ""}`,
  }));
  const tenantOptions = options.data.tenants.map((tenant) => ({ value: tenant.id, label: tenant.fullName }));
  return <CreateLeaseDialog apartments={apartmentOptions} tenants={tenantOptions} />;
}

async function LeasesSection({ q, page, limit, status }: { q: string; page: number; limit: number; status: string }) {
  const query = new URLSearchParams({ limit: String(limit), page: String(page) });
  if (status) query.set("status", status);
  if (q) query.set("q", q);
  const response = await serverApiFetch<ApiList<LeaseRow>>(`/api/leases?${query.toString()}`);
  const total = response.pagination?.total ?? response.data.length;
  return (
    <>
      <ListControls
        query={q}
        page={page}
        limit={limit}
        total={total}
        placeholder="Rechercher un locataire ou une unité…"
        filters={[
          {
            name: "status",
            label: "Statut",
            value: status,
            allLabel: "Tous les statuts",
            options: [
              { value: "draft", label: "Brouillon" },
              { value: "active", label: "Actif" },
              { value: "expired", label: "Expiré" },
              { value: "terminated", label: "Résilié" },
            ],
          },
        ]}
      />
      <Card>
        <CardHeader>
          <CardTitle>Contrats de location</CardTitle>
          <CardDescription>{total} bail(s) dans votre portefeuille.</CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          <DataTable columns={leaseColumns} data={response.data} emptyMessage="Aucun bail enregistré." />
        </CardContent>
      </Card>
    </>
  );
}