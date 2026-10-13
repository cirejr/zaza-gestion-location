import { PageHeader } from "@/components/dashboard/page-header";
import { SubscriptionSettings, type SubscriptionRow } from "@/components/dashboard/subscription-settings";
import { ManualBilling, type BillingInstruction, type BillingPlan, type PaymentRequest } from "@/components/billing/manual-billing";
import { LeaveAgencyCard } from "@/components/dashboard/leave-agency-card";
import { requireDashboardUser } from "@/lib/dashboard-guard";
import { serverApiFetch } from "@/lib/server-api";
import type { ApiList } from "@/lib/dashboard-types";

export const dynamic = "force-dynamic";

type SubscriptionPayload = {
  subscription: {
    status: string;
    currentPeriodEnd: string | null;
    trialEndsAt: string | null;
    plan: string;
    cancelAtPeriodEnd: boolean;
  } | null;
  plan: { name: string; monthlyPriceXof: number; annualPriceXof: number } | null;
  access: { allowed: boolean; access: string; inGrace: boolean } | null;
};

export default async function SubscriptionSettingsPage() {
  const user = await requireDashboardUser();
  const [legacy, current, plans, instructions, requests] = await Promise.all([
    serverApiFetch<ApiList<SubscriptionRow>>("/api/subscriptions"),
    serverApiFetch<{ data: SubscriptionPayload }>("/api/billing/subscription"),
    serverApiFetch<{ data: BillingPlan[] }>("/api/billing/plans"),
    serverApiFetch<{ data: BillingInstruction[] }>("/api/billing/instructions"),
    serverApiFetch<{ data: PaymentRequest[] }>("/api/billing/requests"),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Agence"
        title="Abonnement"
        description="Paiement manuel (Wave, Orange Money, espèces) vérifié par l'administrateur."
      />
      <ManualBilling
        subscription={current.data.subscription}
        plan={current.data.plan}
        access={current.data.access}
        plans={plans.data}
        instructions={instructions.data}
        requests={requests.data}
      />
      <SubscriptionSettings
        subscriptions={legacy.data}
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
