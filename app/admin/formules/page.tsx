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
        <h1 className="text-2xl font-bold">Formules & instructions</h1>
        <p className="text-sm text-muted-foreground">Catalogue facturé aux agences et consignes de paiement affichées.</p>
      </div>
      <CatalogPanel />
    </div>
  );
}
