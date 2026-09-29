import { Download, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CreateLeaseDialog } from "@/components/dashboard/create-lease-dialog";
import { PageHeader } from "@/components/dashboard/page-header";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { serverApiFetch } from "@/lib/server-api";
import { requireDashboardUser } from "@/lib/dashboard-guard";
import type { ApiApartment, ApiList, ApiTenant, LeaseRow } from "@/lib/dashboard-types";
import { formatCfa, formatDate } from "@/lib/dashboard-utils";

export const dynamic = "force-dynamic";

export default async function LeasesPage() {
  await requireDashboardUser();
  const [response, apartments, tenants] = await Promise.all([
    serverApiFetch<ApiList<LeaseRow>>("/api/leases?limit=100"),
    fetchAllApartments(),
    serverApiFetch<ApiList<ApiTenant>>("/api/tenants?limit=100"),
  ]);

  const apartmentOptions = apartments.map((apartment) => ({
    value: apartment.id,
    label: `${apartment.unitNumber} — ${formatCfa(apartment.rentAmount)}/mois${apartment.status === "occupied" ? " (occupée)" : ""}`,
  }));
  const tenantOptions = tenants.data.map((tenant) => ({ value: tenant.id, label: tenant.fullName }));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Documents"
        title="Baux"
        description="Contrats, caution et périodes de location."
        action={<CreateLeaseDialog apartments={apartmentOptions} tenants={tenantOptions} />}
      />
      <Card>
        <CardHeader>
          <CardTitle>Contrats de location</CardTitle>
          <CardDescription>{response.data.length} bail(s) dans votre portefeuille.</CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Contrat</TableHead>
                <TableHead>Locataire</TableHead>
                <TableHead>Période</TableHead>
                <TableHead>Caution</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead className="text-right">Document</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {response.data.length ? response.data.map((row) => (
                <TableRow key={row.lease.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span className="flex size-8 items-center justify-center rounded-lg bg-secondary text-secondary-foreground"><FileText /></span>
                      <span className="text-xs font-semibold">{row.apartment.unitNumber}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm font-medium">{row.tenant.fullName}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{formatDate(row.lease.startDate)}{row.lease.endDate ? ` → ${formatDate(row.lease.endDate)}` : ""}</TableCell>
                  <TableCell className="text-xs font-semibold">{formatCfa(row.lease.depositAmount)}</TableCell>
                  <TableCell><StatusBadge status={row.lease.status} /></TableCell>
                  <TableCell className="text-right">
                    <Button render={<a href={`/api/leases/${row.lease.id}/contract.pdf`} target="_blank" rel="noreferrer" />} variant="ghost" size="icon-sm" aria-label="Télécharger le contrat"><Download /></Button>
                  </TableCell>
                </TableRow>
              )) : (
                <TableRow><TableCell colSpan={6} className="h-32 text-center text-sm text-muted-foreground">Aucun bail enregistré.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

async function fetchAllApartments(): Promise<ApiApartment[]> {
  const buildings = await serverApiFetch<ApiList<{ id: string }>>("/api/buildings?limit=100");
  const groups = await Promise.all(buildings.data.map((building) => serverApiFetch<ApiList<ApiApartment>>(`/api/buildings/${building.id}/apartments?limit=100`)));
  return groups.flatMap((group) => group.data);
}