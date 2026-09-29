import { Droplets } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CreateUtilityDialog } from "@/components/dashboard/create-utility-dialog";
import { ListControls } from "@/components/dashboard/list-controls";
import { PageHeader } from "@/components/dashboard/page-header";
import { RowAction } from "@/components/dashboard/row-action";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { serverApiFetch } from "@/lib/server-api";
import { requireDashboardUser } from "@/lib/dashboard-guard";
import type { UtilitiesOverviewResponse } from "@/lib/dashboard-types";
import { formatCfa } from "@/lib/dashboard-utils";

export const dynamic = "force-dynamic";

const typeLabels: Record<string, string> = {
  water: "Eau",
  electricity: "Électricité",
  security: "Sécurité",
  other: "Autre",
};

export default async function UtilitiesPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  const params = await searchParams;
  const q = params.q ?? "";
  const page = Number(params.page ?? "1") || 1;
  const limit = 25;
  await requireDashboardUser();
  const response = await serverApiFetch<UtilitiesOverviewResponse>(`/api/utilities/overview?limit=${limit}&page=${page}${q ? `&q=${encodeURIComponent(q)}` : ""}`);
  const invoices = response.data.invoices;
  const total = response.pagination?.total ?? invoices.length;
  const buildingOptions = response.data.buildings.map((building) => ({ value: building.id, label: building.name }));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Charges"
        title="Factures communes"
        description="Répartissez automatiquement les charges entre les unités."
        action={<CreateUtilityDialog buildings={buildingOptions} />}
      />
      <ListControls query={q} page={page} limit={limit} total={total} placeholder="Rechercher un immeuble, fournisseur, période…" />
      <Card>
        <CardHeader>
          <CardTitle>Factures récentes</CardTitle>
          <CardDescription>{total} facture(s) enregistrée(s).</CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Charge</TableHead>
                <TableHead>Immeuble</TableHead>
                <TableHead>Période</TableHead>
                <TableHead>Montant</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoices.length ? invoices.map(({ utility, building }) => (
                <TableRow key={utility.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span className="flex size-8 items-center justify-center rounded-lg bg-secondary text-secondary-foreground"><Droplets /></span>
                      <span className="text-sm font-semibold">{typeLabels[utility.type] ?? utility.type}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{building.name}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{utility.period}</TableCell>
                  <TableCell className="text-sm font-bold">{formatCfa(utility.totalAmount)}</TableCell>
                  <TableCell><StatusBadge status={utility.splitStatus} /></TableCell>
                  <TableCell className="text-right">
                    <RowAction
                      endpoint={`/api/utilities/${utility.id}/notify`}
                      label="Notifier les locataires"
                      icon="send"
                      confirm
                      confirmTitle="Envoyer la note aux locataires par WhatsApp ?"
                      successMessage="Notes envoyées."
                      disabled={utility.splitStatus === "notified"}
                    />
                  </TableCell>
                </TableRow>
              )) : (
                <TableRow><TableCell colSpan={6} className="h-32 text-center text-sm text-muted-foreground">Aucune facture commune enregistrée.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}