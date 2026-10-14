import { RequestsPanel } from "@/components/billing/admin/requests-panel";
import { AdminDenied } from "@/components/billing/admin/denied";
import type { RequestRow } from "@/components/billing/admin/types";
import { ServerApiError, serverApiFetch } from "@/lib/server-api";

export const dynamic = "force-dynamic";

export default async function AdminRequestsPage() {
  let requests: RequestRow[] = [];
  try {
    const response = await serverApiFetch<{ data: RequestRow[] }>("/api/admin/billing/requests?status=notified");
    requests = response.data;
  } catch (error) {
    if (error instanceof ServerApiError && error.status === 403) return <AdminDenied />;
    throw error;
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">Demandes de paiement</h1>
        <p className="text-sm text-muted-foreground">File de vérification manuelle, par défaut les signalements en attente.</p>
      </div>
      <RequestsPanel initialRequests={requests} />
    </div>
  );
}
