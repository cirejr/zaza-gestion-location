import Link from "next/link";
import { LockKeyhole } from "lucide-react";
import { ManualBilling, type BillingInstruction, type BillingPlan, type PaymentRequest } from "@/components/billing/manual-billing";
import { AccountActions, PolicyAcceptance } from "@/components/billing/account-actions";
import { verifySession } from "@/lib/dal";
import { serverApiFetch } from "@/lib/server-api";
import type { ApiUser } from "@/lib/dashboard-types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

type SubscriptionPayload = {
  subscription: {
    status: string;
    currentPeriodStart: string | null;
    currentPeriodEnd: string | null;
    graceUntil: string | null;
    trialEndsAt: string | null;
    plan: string;
    cancelAtPeriodEnd: boolean;
  } | null;
  plan: { name: string; monthlyPriceXof: number; annualPriceXof: number } | null;
  access: { allowed: boolean; access: string; inGrace: boolean } | null;
};

export default async function BillingSubscriptionPage({
  searchParams,
}: {
  searchParams: Promise<{ required?: string }>;
}) {
  // Deliberately NOT getViewer: locked agencies must always reach this page.
  await verifySession();
  const { required } = await searchParams;
  const [me, current, plans, instructions, requests] = await Promise.all([
    serverApiFetch<{ data: ApiUser }>("/api/users/me"),
    serverApiFetch<{ data: SubscriptionPayload }>("/api/billing/subscription"),
    serverApiFetch<{ data: BillingPlan[] }>("/api/billing/plans"),
    serverApiFetch<{ data: BillingInstruction[] }>("/api/billing/instructions"),
    serverApiFetch<{ data: PaymentRequest[] }>("/api/billing/requests"),
  ]);

  const locked = !current.data.access?.allowed;
  const isOwner = me.data.role === "owner";

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Facturation Naya</p>
        <h1 className="text-2xl font-bold">Abonnement de l’agence</h1>
        <p className="text-sm text-muted-foreground">
          Paiement manuel (Wave, Orange Money, espèces) vérifié par l’administrateur. L’accès est
          rétabli dès la confirmation du paiement.
        </p>
      </div>

      {required && (
        <Card className="border-amber-500/50 bg-amber-500/10">
          <CardContent className="py-4 text-sm">
            <strong>Abonnement requis.</strong> Cette action nécessite un abonnement actif.
            Choisissez une formule ci-dessous, payez via mobile money ou espèces, puis signalez
            votre paiement — l’administrateur l’activera après vérification.
          </CardContent>
        </Card>
      )}

      <PolicyAcceptance acceptedVersion={me.data.policyVersion ?? null} />

      {locked && (
        <Card className="border-destructive/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <LockKeyhole className="size-5" />
              Accès à l’application verrouillé
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            <p>
              Votre abonnement a expiré et la période de grâce de 7 jours est dépassée.
              Le tableau de bord, les biens, baux, locataires, prospects, la comptabilité et les
              rapports sont inaccessibles. <strong>Vos données sont conservées</strong> et l’accès
              sera rétabli dès la confirmation de votre paiement.
            </p>
            <ol className="list-decimal pl-5">
              <li>Choisissez une formule ci-dessous — une référence unique est générée.</li>
              <li>Payez hors application (Wave, Orange Money, espèces) avec cette référence.</li>
              <li>Signalez le paiement (référence, date, reçu). L’administrateur vérifie puis active.</li>
            </ol>
            <div className="flex flex-wrap gap-2 pt-1">
              <Button size="sm" render={<a href="#plans" />}>Choisir / renouveler</Button>
              <Button size="sm" variant="outline" render={<a href="#submit-payment" />}>Signaler un paiement</Button>
              <Button size="sm" variant="outline" render={<a href="#support" />}>Contacter le support</Button>
            </div>
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

      <AccountActions isOwner={isOwner} />

      <p className="text-xs text-muted-foreground">
        En payant, vous acceptez la <Link className="underline" href="/policy">politique de facturation</Link>.
        Tableau de bord : <Link className="underline" href="/">retour à l’accueil</Link> (redirection ici tant que l’abonnement est inactif).
      </p>
    </div>
  );
}
