import { SubscriptionsPanel } from "@/components/billing/admin/subscriptions-panel";
import { AdminDenied } from "@/components/billing/admin/denied";
import { verifySession } from "@/lib/dal";
import { getServerSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function AdminSubscriptionsPage() {
  // Role check without touching agency data: the panel loads over the API.
  await verifySession();
  const session = await getServerSession();
  if ((session?.user as { role?: unknown } | undefined)?.role !== "admin") return <AdminDenied />;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">Abonnements</h1>
        <p className="text-sm text-muted-foreground">Un abonnement par agence — historique, suspension, prolongations auditées.</p>
      </div>
      <SubscriptionsPanel />
    </div>
  );
}
