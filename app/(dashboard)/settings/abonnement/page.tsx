import { PageHeader } from "@/components/dashboard/page-header";
import { ManualBilling, type BillingInstruction, type BillingPlan, type PaymentRequest } from "@/components/billing/manual-billing";
import { LeaveAgencyCard } from "@/components/dashboard/leave-agency-card";
import { requireDashboardUser } from "@/lib/dashboard-guard";
import { serverApiFetch } from "@/lib/server-api";
import { Card, CardContent } from "@/components/ui/card";

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

export default async function SubscriptionSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ required?: string }>;
}) {
  const user = await requireDashboardUser();
  const { required } = await searchParams;
  const [current, plans, instructions, requests] = await Promise.all([
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
      {required && (
        <Card className="border-amber-500/50 bg-amber-500/10">
          <CardContent className="py-4 text-sm">
            <strong>Abonnement requis.</strong> Cette action nécessite un abonnement actif.
            Choisissez une formule ci-dessous, payez via mobile money ou espèces, puis signalez
            votre paiement — l’administrateur l’activera après vérification.
          </CardContent>
        </Card>
      )}
      <ManualBilling
        subscription={current.data.subscription}
        plan={current.data.plan}
        access={current.data.access}
        plans={plans.data}
        instructions={instructions.data}
        requests={requests.data}
      />
      <LeaveAgencyCard
        organizationId={user.organization?.id ?? ""}
        canLeave={user.role !== "owner"}
        agencyName={user.organization?.name ?? "cette agence"}
      />
    </div>
  );
}
