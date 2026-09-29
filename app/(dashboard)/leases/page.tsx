import { Suspense } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { CreateLeaseDialog } from "@/components/dashboard/create-lease-dialog";
import { ButtonSkeleton, TableCardSkeleton } from "@/components/dashboard/skeletons";
import { PageHeader } from "@/components/dashboard/page-header";
import { leaseColumns } from "./columns";
import { serverApiFetch } from "@/lib/server-api";
import { requireDashboardUser } from "@/lib/dashboard-guard";
import type { ApiApartment, ApiList, ApiTenant, LeaseRow } from "@/lib/dashboard-types";
import { formatCfa } from "@/lib/dashboard-utils";

/** Apartment rows returned by the purpose-built `/api/leases/options` route. */
type LeaseOptionApartment = ApiApartment & { buildingName: string };

export const dynamic = "force-dynamic";

export default async function LeasesPage() {
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
      <Suspense fallback={<TableCardSkeleton title="Contrats de location" rows={8} columns={6} />}>
        <LeasesSection />
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

async function LeasesSection() {
  const response = await serverApiFetch<ApiList<LeaseRow>>("/api/leases?limit=100");
  return (
    <Card>
      <CardHeader>
        <CardTitle>Contrats de location</CardTitle>
        <CardDescription>{response.data.length} bail(s) dans votre portefeuille.</CardDescription>
      </CardHeader>
      <CardContent className="px-0">
        <DataTable columns={leaseColumns} data={response.data} emptyMessage="Aucun bail enregistré." />
      </CardContent>
    </Card>
  );
}