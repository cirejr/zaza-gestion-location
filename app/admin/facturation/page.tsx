import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AdminBillingClient } from "@/components/billing/admin-billing-client";
import { ServerApiError, serverApiFetch } from "@/lib/server-api";

export const dynamic = "force-dynamic";

type Overview = {
  active: number;
  pending: number;
  expired: number;
  expiringCount: number;
  recent: Array<{ id: string; reference: string; expectedAmountXof: number; decidedAt: string | null }>;
};

export default async function AdminBillingPage() {
  let overview: Overview | null = null;
  let requests: Array<{
    request: {
      id: string;
      agencyId: string;
      reference: string;
      billingInterval: string;
      expectedAmountXof: number;
      method: string;
      status: string;
      claimedRef: string | null;
      receiptUrl: string | null;
      note: string | null;
      actualAmountXof: number | null;
      createdAt: string;
    };
    agencyName: string | null;
  }> = [];
  let denied = false;

  try {
    const [o, r] = await Promise.all([
      serverApiFetch<{ data: Overview }>("/api/admin/billing/overview"),
      serverApiFetch<{ data: typeof requests }>("/api/admin/billing/requests?status=notified"),
    ]);
    overview = o.data;
    requests = r.data;
  } catch (error) {
    if (error instanceof ServerApiError && error.status === 403) denied = true;
    else throw error;
  }

  if (denied) {
    return (
      <Card>
        <CardHeader><CardTitle>Accès refusé</CardTitle></CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Cette section est réservée à l’administrateur de la plateforme (rôle <code>admin</code> Better Auth).
          Demandez une promotion via <code>bun scripts/promote-admin.ts votre@email</code>.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-4">
        {[
          { label: "Actifs", value: overview?.active ?? 0 },
          { label: "En vérification", value: overview?.pending ?? 0 },
          { label: "Expirés", value: overview?.expired ?? 0 },
          { label: "Expirent ≤ 7 j", value: overview?.expiringCount ?? 0 },
        ].map((stat) => (
          <Card key={stat.label}>
            <CardHeader><CardTitle className="text-sm font-medium text-muted-foreground">{stat.label}</CardTitle></CardHeader>
            <CardContent className="text-3xl font-bold">{stat.value}</CardContent>
          </Card>
        ))}
      </div>
      <AdminBillingClient initialRequests={requests} />
      <Card>
        <CardHeader><CardTitle>Paiements confirmés récents</CardTitle></CardHeader>
        <CardContent className="px-0">
          {(overview?.recent.length ?? 0) === 0 ? (
            <p className="px-6 py-4 text-sm text-muted-foreground">Aucun paiement confirmé pour le moment.</p>
          ) : (
            <ul className="divide-y">
              {overview!.recent.map((r) => (
                <li key={r.id} className="flex items-center justify-between px-6 py-2 text-sm">
                  <span className="font-medium">{r.reference}</span>
                  <span>{r.expectedAmountXof.toLocaleString("fr-FR")} FCFA</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
