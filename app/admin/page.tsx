import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { AdminDenied } from "@/components/billing/admin/denied";
import type { ClosureRow } from "@/components/billing/admin/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ServerApiError, serverApiFetch } from "@/lib/server-api";

export const dynamic = "force-dynamic";

type Overview = {
  active: number;
  pending: number;
  expired: number;
  openClosures: number;
  expiringCount: number;
  expiring: Array<{ id: string; agencyId: string; currentPeriodEnd: string | null }>;
  recent: Array<{ id: string; reference: string; expectedAmountXof: number; decidedAt: string | null }>;
};

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(new Date(value));
}

export default async function AdminOverviewPage() {
  let overview: Overview | null = null;
  let closures: ClosureRow[] = [];
  try {
    const [o, cl] = await Promise.all([
      serverApiFetch<{ data: Overview }>("/api/admin/billing/overview"),
      serverApiFetch<{ data: ClosureRow[] }>("/api/admin/billing/closures"),
    ]);
    overview = o.data;
    closures = cl.data;
  } catch (error) {
    if (error instanceof ServerApiError && error.status === 403) return <AdminDenied />;
    throw error;
  }

  const stats = [
    { label: "Abonnements actifs", value: overview?.active ?? 0, href: "/admin/abonnements" },
    { label: "Paiements à vérifier", value: overview?.pending ?? 0, href: "/admin/demandes", highlight: (overview?.pending ?? 0) > 0 },
    { label: "Expirés", value: overview?.expired ?? 0, href: "/admin/abonnements" },
    { label: "Expirent ≤ 7 jours", value: overview?.expiringCount ?? 0, href: "/admin/abonnements" },
    { label: "Fermetures ouvertes", value: overview?.openClosures ?? 0, href: "#fermetures" },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">Vue d’ensemble</h1>
        <p className="text-sm text-muted-foreground">Santé des abonnements et file de vérification manuelle.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {stats.map((stat) => (
          <Link key={stat.label} href={stat.href}>
            <Card className={stat.highlight ? "border-primary" : undefined}>
              <CardHeader><CardTitle className="text-sm font-medium text-muted-foreground">{stat.label}</CardTitle></CardHeader>
              <CardContent className="flex items-center justify-between">
                <span className="text-3xl font-bold">{stat.value}</span>
                <ArrowRight className="size-4 text-muted-foreground" />
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Abonnements expirant bientôt</CardTitle></CardHeader>
          <CardContent className="px-0">
            {(overview?.expiring.length ?? 0) === 0 ? (
              <p className="px-6 py-4 text-sm text-muted-foreground">Aucune échéance dans les 7 prochains jours.</p>
            ) : (
              <ul className="divide-y">
                {overview!.expiring.map((row) => (
                  <li key={row.id} className="flex items-center justify-between px-6 py-2 text-sm">
                    <span className="truncate font-medium">{row.agencyId}</span>
                    <span className="text-muted-foreground">{formatDate(row.currentPeriodEnd)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Paiements confirmés récents</CardTitle></CardHeader>
          <CardContent className="px-0">
            {(overview?.recent.length ?? 0) === 0 ? (
              <p className="px-6 py-4 text-sm text-muted-foreground">Aucun paiement confirmé pour le moment.</p>
            ) : (
              <ul className="divide-y">
                {overview!.recent.map((row) => (
                  <li key={row.id} className="flex items-center justify-between px-6 py-2 text-sm">
                    <span className="font-medium">{row.reference}</span>
                    <span>{row.expectedAmountXof.toLocaleString("fr-FR")} FCFA</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card id="fermetures" className="scroll-mt-6">
        <CardHeader>
          <CardTitle>Demandes de fermeture / assistance ({closures.length})</CardTitle>
          <p className="text-sm text-muted-foreground">À traiter manuellement — aucune action automatique n’est appliquée.</p>
        </CardHeader>
        <CardContent className="px-0">
          {closures.length === 0 ? (
            <p className="px-6 py-4 text-sm text-muted-foreground">Aucune demande pour le moment.</p>
          ) : (
            <ul className="divide-y">
              {closures.map((row) => (
                <li key={row.closure.id} className="flex flex-col gap-1 px-6 py-2 text-sm">
                  <p className="font-medium">{row.agencyName ?? row.closure.agencyId} — {row.closure.status}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatDate(row.closure.createdAt)} — {row.closure.reason}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
