import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { CreatePaymentDialog } from "@/components/dashboard/create-payment-dialog";
import { ListControls } from "@/components/dashboard/list-controls";
import { PageHeader } from "@/components/dashboard/page-header";
import { paymentColumns } from "./columns";
import { serverApiFetch } from "@/lib/server-api";
import { requireDashboardUser } from "@/lib/dashboard-guard";
import type { ApiList, LeaseRow, PaymentRow, PaymentSummary } from "@/lib/dashboard-types";
import { formatCfa } from "@/lib/dashboard-utils";

export const dynamic = "force-dynamic";

export default async function PaymentsPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string; status?: string }> }) {
  const params = await searchParams;
  const q = params.q ?? "";
  const page = Number(params.page ?? "1") || 1;
  const limit = 20;
  const status = params.status ?? "";
  await requireDashboardUser();
  const [response, leases, summaryResponse] = await Promise.all([
    serverApiFetch<ApiList<PaymentRow>>(`/api/payments?limit=${limit}&page=${page}${status ? `&status=${status}` : ""}${q ? `&q=${encodeURIComponent(q)}` : ""}`),
    serverApiFetch<ApiList<LeaseRow>>("/api/leases?limit=100"),
    serverApiFetch<{ data: PaymentSummary }>("/api/payments/summary"),
  ]);
  const total = response.pagination?.total ?? response.data.length;
  const summary = summaryResponse.data;
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
        <Card><CardHeader><CardDescription>Total encaissé</CardDescription><CardTitle>{formatCfa(summary.collected)}</CardTitle></CardHeader></Card>
        <Card><CardHeader><CardDescription>Paiements enregistrés</CardDescription><CardTitle>{summary.total}</CardTitle></CardHeader></Card>
        <Card><CardHeader><CardDescription>Reçus PDF</CardDescription><CardTitle>{summary.receiptCount}</CardTitle></CardHeader></Card>
      </div>
      <ListControls query={q} page={page} limit={limit} total={total} placeholder="Rechercher un locataire ou une unité…" />
      <Card>
        <CardHeader>
          <CardTitle>Historique des paiements</CardTitle>
          <CardDescription>Les données proviennent de l’API Hono.</CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          <DataTable columns={paymentColumns} data={response.data} emptyMessage="Aucun paiement enregistré." />
        </CardContent>
      </Card>
    </div>
  );
}