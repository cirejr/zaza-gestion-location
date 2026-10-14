import { CatalogPanel } from "@/components/billing/admin/catalog-panel";
import { AdminDenied } from "@/components/billing/admin/denied";
import { verifySession } from "@/lib/dal";
import { getServerSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function AdminCatalogPage() {
  await verifySession();
  const session = await getServerSession();
  if ((session?.user as { role?: unknown } | undefined)?.role !== "admin") return <AdminDenied />;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">Tarifs & paiements</h1>
        <p className="text-sm text-muted-foreground">Les formules vendues aux agences et les instructions de paiement (numéros Wave, Orange Money, espèces) qu’elles voient.</p>
      </div>
      <CatalogPanel />
    </div>
  );
}
