import { MessageCircle, UserRound } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CreateDialog, type DialogField } from "@/components/dashboard/create-dialog";
import { ListControls } from "@/components/dashboard/list-controls";
import { PageHeader } from "@/components/dashboard/page-header";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { serverApiFetch } from "@/lib/server-api";
import { requireDashboardUser } from "@/lib/dashboard-guard";
import type { TenantOverviewResponse } from "@/lib/dashboard-types";
import { formatDate, initials } from "@/lib/dashboard-utils";

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
  const response = await serverApiFetch<TenantOverviewResponse>(`/api/tenants/overview?limit=${limit}&page=${page}${q ? `&q=${encodeURIComponent(q)}` : ""}`);
  const total = response.pagination?.total ?? response.data.length;
  const summary = response.summary;

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
      <ListControls query={q} page={page} limit={limit} total={total} placeholder="Rechercher un locataire…" />
      <Card>
        <CardHeader>
          <CardTitle>Répertoire</CardTitle>
          <CardDescription>{total} locataire(s) enregistré(s).</CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Locataire</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Unité / bail</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {response.data.length ? response.data.map((tenant) => {
                const lease = tenant.lease;
                return (
                  <TableRow key={tenant.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="flex size-8 items-center justify-center rounded-full bg-secondary text-[10px] font-bold">{initials(tenant.fullName)}</span>
                        <span className="text-sm font-semibold">{tenant.fullName}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{tenant.whatsappNumber ?? tenant.phone}</TableCell>
                    <TableCell className="text-xs">
                      {lease ? (
                        <>
                          <span className="font-semibold">{lease.apartment.unitNumber}</span>
                          <span className="block text-muted-foreground">{formatDate(lease.lease.startDate)}{lease.lease.endDate ? ` → ${formatDate(lease.lease.endDate)}` : ""}</span>
                        </>
                      ) : (
                        <span className="text-muted-foreground">Aucun bail</span>
                      )}
                    </TableCell>
                    <TableCell><StatusBadge status={lease?.lease.status ?? "vacant"} /></TableCell>
                    <TableCell className="text-right">
                      <a
                        href={`https://wa.me/${(tenant.whatsappNumber ?? tenant.phone).replace(/[^0-9]/g, "")}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex h-8 items-center justify-center gap-1 rounded-lg px-2 text-xs font-medium text-foreground hover:bg-muted"
                        aria-label={`Contacter ${tenant.fullName} sur WhatsApp`}
                      >
                        <MessageCircle /> WhatsApp
                      </a>
                    </TableCell>
                  </TableRow>
                );
              }) : (
                <TableRow><TableCell colSpan={5} className="h-32 text-center text-sm text-muted-foreground">Aucun locataire enregistré.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <div className="grid gap-4 sm:grid-cols-3">
        <Card><CardHeader><CardDescription>Baux actifs</CardDescription><CardTitle>{summary.activeLeases}</CardTitle></CardHeader></Card>
        <Card><CardHeader><CardDescription>Baux à renouveler</CardDescription><CardTitle>{summary.otherLeases}</CardTitle></CardHeader></Card>
        <Card><CardHeader><CardDescription>Contact WhatsApp</CardDescription><CardTitle>{summary.whatsappTenants}</CardTitle></CardHeader></Card>
      </div>
    </div>
  );
}