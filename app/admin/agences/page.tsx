import Link from "next/link";
import { AdminDenied } from "@/components/billing/admin/denied";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { ServerApiError, serverApiFetch } from "@/lib/server-api";

export const dynamic = "force-dynamic";

type AgencyRow = {
  id: string;
  name: string;
  slug: string | null;
  createdAt: string;
  contactEmail: string | null;
  contactPhone: string | null;
  city: string | null;
  memberCount: number;
  subscription: {
    status: string;
    plan: string;
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
  } | null;
};

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(new Date(value));
}

export default async function AdminAgenciesPage() {
  let agencies: AgencyRow[] = [];
  try {
    const response = await serverApiFetch<{ data: AgencyRow[] }>("/api/admin/billing/agencies");
    agencies = response.data;
  } catch (error) {
    if (error instanceof ServerApiError && error.status === 403) return <AdminDenied />;
    throw error;
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">Agences ({agencies.length})</h1>
        <p className="text-sm text-muted-foreground">Toutes les organisations clientes : contact, taille et état d’abonnement. Gérer un abonnement depuis <Link className="underline" href="/admin/abonnements">la page Abonnements</Link>.</p>
      </div>
      <Card>
        <CardContent className="px-0">
          {agencies.length === 0 ? (
            <p className="px-6 py-4 text-sm text-muted-foreground">Aucune agence inscrite.</p>
          ) : (
            <ul className="divide-y">
              {agencies.map((agency) => (
                <li key={agency.id} className="flex flex-col gap-2 px-6 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-semibold">{agency.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {agency.contactEmail ?? "sans email"} {agency.contactPhone ? `• ${agency.contactPhone}` : ""} {agency.city ? `• ${agency.city}` : ""}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {agency.memberCount} membre(s)
                      {agency.subscription?.currentPeriodEnd ? ` • payé jusqu’au ${formatDate(agency.subscription.currentPeriodEnd)}` : ""}
                      {agency.subscription?.cancelAtPeriodEnd ? " • résiliation programmée" : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {agency.subscription ? (
                      <>
                        <span className="text-xs text-muted-foreground">{agency.subscription.plan}</span>
                        <StatusBadge status={agency.subscription.status} />
                      </>
                    ) : (
                      <span className="text-xs font-medium text-muted-foreground">sans abonnement</span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
