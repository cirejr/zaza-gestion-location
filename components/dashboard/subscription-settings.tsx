"use client";

import { useState, type FormEvent } from "react";
import { CreditCard, ExternalLink, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";

export type SubscriptionRow = {
  id: string;
  plan: string;
  amount: string;
  status: string;
  checkoutUrl?: string | null;
  createdAt: string;
};

const planOptions = [
  { value: "monthly", label: "Mensuel" },
  { value: "annual", label: "Annuel" },
];

const planLabels: Record<string, string> = { monthly: "Mensuel", annual: "Annuel" };

/** Montants fixes côté serveur (XOF) */
const planAmounts = {
  monthly: "5000.00",
  annual: "50000.00",
};

/** Récupère le montant affiché pour un plan donné */
function getPlanAmount(plan: string) {
  return planAmounts[plan as keyof typeof planAmounts] ?? "0.00";
}

/**
 * Agency subscription: the plan history and a checkout flow.
 * A subscription belongs to the agency, not to the person, so every owner/manager sees the same list.
 */
export function SubscriptionSettings({
  subscriptions,
  defaults,
}: {
  subscriptions: SubscriptionRow[];
  defaults: { name: string; email: string; phone: string };
}) {
  const [open, setOpen] = useState(false);
  const [plan, setPlan] = useState("monthly");
  const [customerName, setCustomerName] = useState(defaults.name);
  const [customerEmail, setCustomerEmail] = useState(defaults.email);
  const [customerPhone, setCustomerPhone] = useState(defaults.phone);
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    try {
      const response = await apiFetch<{ data: { checkoutUrl?: string | null } }>("/api/subscriptions", {
        method: "POST",
        body: JSON.stringify({ plan }),
      });
      const url = response.data.checkoutUrl;
      if (url) {
        window.location.href = url;
        return;
      }
      toast.success("Abonnement créé. En attente de paiement.");
      setOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Impossible de créer l’abonnement.");
    } finally {
      setSubmitting(false);
    }
  }

  const active = subscriptions.find((subscription) => subscription.status === "active");

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div>
          <CardDescription>Formule en cours</CardDescription>
          <CardTitle className="flex items-center gap-2">
            {active ? `Formule ${planLabels[active.plan] ?? active.plan}` : "Aucun abonnement actif"}
            {active && <StatusBadge status="active" />}
          </CardTitle>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger render={<Button />}>
            <Sparkles data-icon="inline-start" />
            {active ? "Renouveler" : "Souscrire"}
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Choisir un abonnement</DialogTitle>
              <DialogDescription>Vous serez redirigé vers la page de paiement sécurisée.</DialogDescription>
            </DialogHeader>
            <form onSubmit={submit}>
              <FieldGroup>
                <Field>
                  <FieldLabel>Formule</FieldLabel>
                  <Select
                    value={plan}
                    items={planOptions}
                    onValueChange={(value) => setPlan(String(value))}
                  >
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {planOptions.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
                <Field>
                  <FieldLabel htmlFor="sub-amount">Montant (FCFA)</FieldLabel>
                  {/* Montant affiché mais non modifiable - fixé côté serveur */}
                  <Input
                    id="sub-amount"
                    inputMode="numeric"
                    value={getPlanAmount(plan)}
                    onChange={(event) => { /* montant figé, ignore les modifications */ }}
                    placeholder={getPlanAmount(plan)}
                    readOnly
                  />
                  <p className="text-xs text-muted-foreground ml-2">
                    {plan === "monthly" ? "5 000 XOF / mois" : "50 000 XOF / an"}
                  </p>
                </Field>
                <Field>
                  <FieldLabel htmlFor="sub-name">Nom</FieldLabel>
                  <Input id="sub-name" value={customerName} onChange={(event) => setCustomerName(event.target.value)} required />
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field>
                    <FieldLabel htmlFor="sub-email">Email</FieldLabel>
                    <Input id="sub-email" type="email" value={customerEmail} onChange={(event) => setCustomerEmail(event.target.value)} />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="sub-phone">Téléphone</FieldLabel>
                    <Input id="sub-phone" value={customerPhone} onChange={(event) => setCustomerPhone(event.target.value)} required />
                  </Field>
                </div>
                <FieldDescription>Un seul abonnement actif par agence.</FieldDescription>
                <div className="flex justify-end">
                  <Button type="submit" disabled={submitting}>
                    {submitting ? <Spinner data-icon="inline-start" /> : <CreditCard data-icon="inline-start" />}
                    Payer
                  </Button>
                </div>
              </FieldGroup>
            </form>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent className="px-0">
        {subscriptions.length === 0 ? (
          <p className="px-6 py-4 text-sm text-muted-foreground">Aucun abonnement enregistré pour cette agence.</p>
        ) : (
          <ul className="divide-y">
            {subscriptions.map((subscription) => (
              <li key={subscription.id} className="flex items-center justify-between gap-4 px-6 py-3">
                <div className="flex items-center gap-3">
                  <span className="flex size-9 items-center justify-center rounded-xl bg-secondary text-secondary-foreground"><CreditCard className="size-4" /></span>
                  <div>
                    <p className="text-sm font-semibold">{planLabels[subscription.plan] ?? subscription.plan} — {subscription.amount} XOF</p>
                    <p className="text-xs text-muted-foreground">Créé le {new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(new Date(subscription.createdAt))}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <StatusBadge status={subscription.status} />
                  {subscription.checkoutUrl && subscription.status !== "active" && (
                    <Button variant="outline" size="sm" render={<a href={subscription.checkoutUrl} target="_blank" rel="noreferrer" />}>
                      Payer<ExternalLink data-icon="inline-end" />
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}