import { Suspense } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { CreatePaymentDialog } from "@/components/dashboard/create-payment-dialog";
import { ListControls } from "@/components/dashboard/list-controls";
import { ButtonSkeleton, KpiGridSkeleton, ListControlsSkeleton, TableCardSkeleton } from "@/components/dashboard/skeletons";
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

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Encaissements"
        title="Paiements"
        description="Suivez chaque référence, reçu et statut de paiement."
        action={
          <Suspense fallback={<ButtonSkeleton className="h-10 w-48" />}>
            <PaymentDialogAction />
          </Suspense>
        }
      />
      <Suspense fallback={<KpiGridSkeleton count={3} />}>
        <PaymentSummaryCards />
      </Suspense>
      <Suspense
        fallback={
          <>
            <ListControlsSkeleton />
            <TableCardSkeleton title="Historique des paiements" rows={8} columns={6} />
          </>
        }
      >
        <PaymentsTable q={q} page={page} limit={limit} status={status} />
      </Suspense>
    </div>
  );
}

async function PaymentDialogAction() {
  const leases = await serverApiFetch<ApiList<LeaseRow>>("/api/leases?limit=100");
  const leaseOptions = leases.data.map((row) => ({ value: row.lease.id, label: `${row.tenant.fullName} — ${row.apartment.unitNumber}` }));
  return <CreatePaymentDialog leases={leaseOptions} />;
}

async function PaymentSummaryCards() {
  const summary = (await serverApiFetch<{ data: PaymentSummary }>("/api/payments/summary")).data;
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <Card><CardHeader><CardDescription>Total encaissé</CardDescription><CardTitle>{formatCfa(summary.collected)}</CardTitle></CardHeader></Card>
      <Card><CardHeader><CardDescription>Paiements enregistrés</CardDescription><CardTitle>{summary.total}</CardTitle></CardHeader></Card>
      <Card><CardHeader><CardDescription>Reçus PDF</CardDescription><CardTitle>{summary.receiptCount}</CardTitle></CardHeader></Card>
    </div>
  );
}

async function PaymentsTable({ q, page, limit, status }: { q: string; page: number; limit: number; status: string }) {
  const response = await serverApiFetch<ApiList<PaymentRow>>(
    `/api/payments?limit=${limit}&page=${page}${status ? `&status=${status}` : ""}${q ? `&q=${encodeURIComponent(q)}` : ""}`,
  );
  const total = response.pagination?.total ?? response.data.length;
  return (
    <>
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
    </>
  );
}