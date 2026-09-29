import { Download, WalletCards } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CreatePaymentDialog } from "@/components/dashboard/create-payment-dialog";
import { ListControls } from "@/components/dashboard/list-controls";
import { PageHeader } from "@/components/dashboard/page-header";
import { RowAction } from "@/components/dashboard/row-action";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { serverApiFetch } from "@/lib/server-api";
import type { ApiList, LeaseRow, PaymentRow } from "@/lib/dashboard-types";
import { formatCfa, formatDate, initials } from "@/lib/dashboard-utils";

export const dynamic = "force-dynamic";

export default async function PaymentsPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string; status?: string }> }) {
  const params = await searchParams;
  const q = params.q ?? "";
  const page = Number(params.page ?? "1") || 1;
  const limit = 20;
  const status = params.status ?? "";
  const [response, leases] = await Promise.all([
    serverApiFetch<ApiList<PaymentRow>>(`/api/payments?limit=${limit}&page=${page}${status ? `&status=${status}` : ""}${q ? `&q=${encodeURIComponent(q)}` : ""}`),
    serverApiFetch<ApiList<LeaseRow>>("/api/leases?limit=100"),
  ]);
  const total = response.pagination?.total ?? response.data.length;
  const data = response.data;
  const collected = data.filter((row) => row.payment.status === "paid").reduce((sum, row) => sum + Number(row.payment.amount), 0);
  const leaseOptions = leases.data.map((row) => ({ value: row.lease.id, label: `${row.tenant.fullName} — ${row.apartment.unitNumber}` }));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Encaissements"
        title="Paiements"
        description="Suivez chaque référence, reçu et statut de paiement."
        action={<CreatePaymentDialog leases={leaseOptions} />}
      />
      <div className="grid gap-4 sm:grid-cols-3">
        <Card><CardHeader><CardDescription>Total encaissé</CardDescription><CardTitle>{formatCfa(collected)}</CardTitle></CardHeader></Card>
        <Card><CardHeader><CardDescription>Paiements enregistrés</CardDescription><CardTitle>{total}</CardTitle></CardHeader></Card>
        <Card><CardHeader><CardDescription>Reçus PDF</CardDescription><CardTitle>{data.filter((row) => row.payment.receiptUrl).length}</CardTitle></CardHeader></Card>
      </div>
      <ListControls query={q} page={page} limit={limit} total={total} placeholder="Rechercher un locataire ou une unité…" />
      <Card>
        <CardHeader>
          <CardTitle>Historique des paiements</CardTitle>
          <CardDescription>Les données proviennent de l’API Hono.</CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Locataire</TableHead>
                <TableHead>Unité</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Montant</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.length ? data.map((row) => (
                <TableRow key={row.payment.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span className="flex size-8 items-center justify-center rounded-full bg-secondary text-[10px] font-bold">{initials(row.tenant.fullName)}</span>
                      <span className="text-sm font-semibold">{row.tenant.fullName}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{row.building.name} · {row.apartment.unitNumber}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{formatDate(row.payment.paidAt ?? row.payment.createdAt)}</TableCell>
                  <TableCell className="text-sm font-bold">{formatCfa(row.payment.amount)}</TableCell>
                  <TableCell><StatusBadge status={row.payment.status} /></TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      {row.payment.status !== "paid" && (
                        <RowAction
                          endpoint={`/api/payments/${row.payment.id}/create-link`}
                          body={{ provider: "paytech" }}
                          label="Créer un lien de paiement"
                          icon="link2"
                          successMessage="Lien de paiement créé."
                        />
                      )}
                      {row.payment.status === "pending" && (row.tenant.whatsappNumber ?? row.tenant.phone) && (
                        <RowAction
                          endpoint="/api/notifications/rent-reminder"
                          body={{
                            channel: "whatsapp",
                            phone: row.tenant.whatsappNumber ?? row.tenant.phone ?? "",
                            tenantName: row.tenant.fullName,
                            buildingName: row.building.name,
                            unitNumber: row.apartment.unitNumber,
                            amount: Number(row.payment.amount),
                            dueDate: formatDate(row.payment.createdAt),
                          }}
                          label="Relancer"
                          size="sm"
                          variant="outline"
                          successMessage="Relance envoyée."
                        />
                      )}
                      <Button render={<a href={`/api/payments/${row.payment.id}/receipt.pdf`} target="_blank" rel="noreferrer" />} variant="ghost" size="icon-sm" aria-label="Télécharger le reçu"><Download /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              )) : (
                <TableRow><TableCell colSpan={6} className="h-32 text-center text-sm text-muted-foreground">Aucun paiement enregistré.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}