import { PageHeader } from "@/components/dashboard/page-header";
import { SubscriptionSettings, type SubscriptionRow } from "@/components/dashboard/subscription-settings";
import { LeaveAgencyCard } from "@/components/dashboard/leave-agency-card";
import { requireDashboardUser } from "@/lib/dashboard-guard";
import { serverApiFetch } from "@/lib/server-api";
import type { ApiList } from "@/lib/dashboard-types";

export const dynamic = "force-dynamic";

export default async function SubscriptionSettingsPage() {
  const user = await requireDashboardUser();
  const response = await serverApiFetch<ApiList<SubscriptionRow>>("/api/subscriptions");

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Agence"
        title="Abonnement"
        description="Votre formule, l’historique des paiements et votre accès à l’agence."
      />
      <SubscriptionSettings
        subscriptions={response.data}
        defaults={{ name: user.name, email: user.email, phone: user.phone ?? "" }}
      />
      <LeaveAgencyCard
        organizationId={user.organization?.id ?? ""}
        canLeave={user.role !== "owner"}
        agencyName={user.organization?.name ?? "cette agence"}
      />
    </div>
  );
}
