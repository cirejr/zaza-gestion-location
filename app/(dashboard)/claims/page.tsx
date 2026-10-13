import { Suspense } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { ListControls } from "@/components/dashboard/list-controls";
import { ListControlsSkeleton, TableCardSkeleton } from "@/components/dashboard/skeletons";
import { PageHeader } from "@/components/dashboard/page-header";
import { claimColumns } from "./columns";
import { serverApiFetch } from "@/lib/server-api";
import { verifySession } from "@/lib/dal";
import type { ApiList, ClaimRow } from "@/lib/dashboard-types";

export const dynamic = "force-dynamic";

export default async function ClaimsPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string; status?: string; type?: string }> }) {
  const params = await searchParams;
  const q = params.q ?? "";
  const page = Number(params.page ?? "1") || 1;
  const status = params.status ?? "";
  const type = params.type ?? "";
  const limit = 20;
  await verifySession();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Réclamations locataires"
        title="Réclamations"
        description="Instruisez les réclamations déposées depuis l’espace locataire."
      />
      <Suspense fallback={<>
        <ListControlsSkeleton />
        <TableCardSkeleton title="Réclamations" rows={8} columns={6} />
      </>}>
        <ClaimsSection q={q} page={page} limit={limit} status={status} type={type} />
      </Suspense>
    </div>
  );
}

async function ClaimsSection({ q, page, limit, status, type }: { q: string; page: number; limit: number; status: string; type: string }) {
  const query = new URLSearchParams({ limit: String(limit), page: String(page) });
  if (status) query.set("status", status);
  if (type) query.set("type", type);
  if (q) query.set("q", q);
  const response = await serverApiFetch<ApiList<ClaimRow>>(`/api/claims?${query.toString()}`);
  const total = response.pagination?.total ?? response.data.length;
  return (
    <>
      <ListControls
        query={q}
        page={page}
        limit={limit}
        total={total}
        placeholder="Rechercher un objet, un locataire…"
        filters={[
          {
            name: "status",
            label: "Statut",
            value: status,
            allLabel: "Tous les statuts",
            options: [
              { value: "pending", label: "En attente" },
              { value: "approved", label: "Approuvée" },
              { value: "rejected", label: "Rejetée" },
            ],
          },
          {
            name: "type",
            label: "Type",
            value: type,
            allLabel: "Tous les types",
            options: [
              { value: "deposit", label: "Dépôt de garantie" },
              { value: "reparation", label: "Réparation" },
              { value: "autre", label: "Autre" },
            ],
          },
        ]}
      />
      <Card>
        <CardHeader>
          <CardTitle>Réclamations</CardTitle>
          <CardDescription>{total} réclamation(s) dans votre portefeuille.</CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          <DataTable columns={claimColumns} data={response.data} emptyMessage="Aucune réclamation enregistrée." />
        </CardContent>
      </Card>
    </>
  );
}