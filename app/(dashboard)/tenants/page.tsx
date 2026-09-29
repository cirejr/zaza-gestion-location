import { Suspense } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { CreateDialog, type DialogField } from "@/components/dashboard/create-dialog";
import { ListControls } from "@/components/dashboard/list-controls";
import { KpiGridSkeleton, ListControlsSkeleton, TableCardSkeleton } from "@/components/dashboard/skeletons";
import { PageHeader } from "@/components/dashboard/page-header";
import { tenantColumns } from "./columns";
import { serverApiFetch } from "@/lib/server-api";
import { requireDashboardUser } from "@/lib/dashboard-guard";
import type { TenantOverviewResponse } from "@/lib/dashboard-types";

export const dynamic = "force-dynamic";

const tenantFields: DialogField[] = [
  { type: "text", name: "fullName", label: "Nom complet", placeholder: "Awa Diallo", required: true },
  { type: "text", name: "phone", label: "Téléphone", placeholder: "+221 77 000 00 00", required: true },
  { type: "text", name: "whatsappNumber", label: "WhatsApp", placeholder: "Même numéro que le téléphone si identique" },
  { type: "upload", name: "identityDocUrl", label: "Pièce d’identité", accept: "image/*,application/pdf", hint: "CNI ou passeport, 10 Mo maximum." },
];

export default async function TenantsPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  const params = await searchParams;
  const q = params.q ?? "";
  const page = Number(params.page ?? "1") || 1;
  const limit = 20;
  await requireDashboardUser();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Annuaire"
        title="Locataires"
        description="Coordonnées, baux et historique de chaque locataire."
        action={
          <CreateDialog
            triggerLabel="Nouveau locataire"
            title="Ajouter un locataire"
            description="Les informations de contact permettent d’envoyer les relances et les notes de charges."
            fields={tenantFields}
            endpoint="/api/tenants"
            successMessage="Locataire ajouté."
          />
        }
      />
      <Suspense
        fallback={
          <>
            <ListControlsSkeleton />
            <TableCardSkeleton title="Répertoire" rows={8} columns={5} />
            <KpiGridSkeleton count={3} />
          </>
        }
      >
        <TenantsSection q={q} page={page} limit={limit} />
      </Suspense>
    </div>
  );
}

async function TenantsSection({ q, page, limit }: { q: string; page: number; limit: number }) {
  const response = await serverApiFetch<TenantOverviewResponse>(`/api/tenants/overview?limit=${limit}&page=${page}${q ? `&q=${encodeURIComponent(q)}` : ""}`);
  const total = response.pagination?.total ?? response.data.length;
  const summary = response.summary;

  return (
    <>
      <ListControls query={q} page={page} limit={limit} total={total} placeholder="Rechercher un locataire…" />
      <Card>
        <CardHeader>
          <CardTitle>Répertoire</CardTitle>
          <CardDescription>{total} locataire(s) enregistré(s).</CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          <DataTable columns={tenantColumns} data={response.data} emptyMessage="Aucun locataire enregistré." />
        </CardContent>
      </Card>
      <div className="grid gap-4 sm:grid-cols-3">
        <Card><CardHeader><CardDescription>Baux actifs</CardDescription><CardTitle>{summary.activeLeases}</CardTitle></CardHeader></Card>
        <Card><CardHeader><CardDescription>Baux à renouveler</CardDescription><CardTitle>{summary.otherLeases}</CardTitle></CardHeader></Card>
        <Card><CardHeader><CardDescription>Contact WhatsApp</CardDescription><CardTitle>{summary.whatsappTenants}</CardTitle></CardHeader></Card>
      </div>
    </>
  );
}