"use client";

import { useState, type FormEvent } from "react";
import { BadgeCheck, Clock, Upload, Wallet } from "lucide-react";
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

export type BillingPlan = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  monthlyPriceXof: number;
  annualPriceXof: number;
  features: string[];
};

export type BillingInstruction = {
  id: string;
  method: string;
  displayName: string | null;
  phoneNumber: string | null;
  instructions: string | null;
};

export type PaymentRequest = {
  id: string;
  reference: string;
  billingInterval: string;
  expectedAmountXof: number;
  method: string;
  status: string;
  claimedRef: string | null;
  receiptUrl: string | null;
  rejectReason: string | null;
  createdAt: string;
  planId: string | null;
};

const methodLabels: Record<string, string> = {
  wave: "Wave",
  orange_money: "Orange Money",
  mtn_momo: "MTN MoMo",
  mobile_money: "Mobile Money",
  cash: "Espèces",
};

const RECEIPT_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
const MAX_RECEIPT_BYTES = 5 * 1024 * 1024;

async function uploadReceipt(file: File): Promise<string> {
  if (!RECEIPT_TYPES.includes(file.type)) throw new Error("Reçu acceptés : JPG, PNG, WebP ou PDF.");
  if (file.size > MAX_RECEIPT_BYTES) throw new Error("Reçu trop lourd (5 Mo maximum).");
  const presign = await apiFetch<{ data: { key: string; url: string } }>("/api/uploads/presign", {
    method: "POST",
    body: JSON.stringify({ filename: file.name, contentType: file.type, directory: "billing" }),
  });
  const put = await fetch(presign.data.url, { method: "PUT", headers: { "Content-Type": file.type }, body: file });
  if (!put.ok) throw new Error("Échec de l'envoi du reçu.");
  return `/api/uploads/${presign.data.key}`;
}

export function ManualBilling({
  subscription,
  plan,
  access,
  plans,
  instructions,
  requests,
}: {
  subscription: { status: string; currentPeriodEnd: string | null; trialEndsAt: string | null; plan: string; cancelAtPeriodEnd: boolean } | null;
  plan: { name: string; monthlyPriceXof: number; annualPriceXof: number } | null;
  access: { allowed: boolean; access: string; inGrace: boolean } | null;
  plans: BillingPlan[];
  instructions: BillingInstruction[];
  requests: PaymentRequest[];
}) {
  const [planId, setPlanId] = useState(plans[0]?.id ?? "");
  const [interval, setInterval] = useState("monthly");
  const [method, setMethod] = useState("wave");
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<PaymentRequest | null>(null);

  const [notifyId, setNotifyId] = useState<string | null>(null);
  const [notifyMethod, setNotifyMethod] = useState("wave");
  const [claimedRef, setClaimedRef] = useState("");
  const [claimedDate, setClaimedDate] = useState("");
  const [note, setNote] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [notifying, setNotifying] = useState(false);

  const selectedPlan = plans.find((p) => p.id === planId);
  const price = selectedPlan ? (interval === "annual" ? selectedPlan.annualPriceXof : selectedPlan.monthlyPriceXof) : 0;
  const pending = requests.filter((r) => r.status === "pending" || r.status === "notified");

  async function createRequest(event: FormEvent) {
    event.preventDefault();
    if (!planId) return;
    setCreating(true);
    try {
      const res = await apiFetch<{ data: PaymentRequest }>("/api/billing/requests", {
        method: "POST",
        body: JSON.stringify({ planId, billingInterval: interval, method }),
      });
      setCreated(res.data);
      toast.success(`Demande ${res.data.reference} créée. Payez puis signalez votre paiement.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Création impossible.");
    } finally {
      setCreating(false);
    }
  }

  async function submitNotify(event: FormEvent) {
    event.preventDefault();
    if (!notifyId) return;
    setNotifying(true);
    try {
      let receiptUrl: string | null = null;
      if (file) receiptUrl = await uploadReceipt(file);
      await apiFetch(`/api/billing/requests/${notifyId}/notify`, {
        method: "POST",
        body: JSON.stringify({
          method: notifyMethod,
          claimedRef: claimedRef || null,
          claimedPaidAt: claimedDate ? new Date(claimedDate).toISOString() : null,
          note: note || null,
          receiptUrl,
        }),
      });
      toast.success("Paiement signalé. Vérification en cours — votre accès reste inchangé.");
      setNotifyId(null);
      setClaimedRef("");
      setClaimedDate("");
      setNote("");
      setFile(null);
      window.location.reload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Envoi impossible.");
    } finally {
      setNotifying(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardDescription>Abonnement actuel</CardDescription>
          <CardTitle className="flex flex-wrap items-center gap-2">
            {subscription ? (
              <>
                {plan?.name ?? (subscription.plan === "annual" ? "Annuel" : "Mensuel")}
                <StatusBadge status={subscription.status} />
              </>
            ) : (
              "Aucun abonnement"
            )}
            {access && <span className="text-sm font-normal text-muted-foreground">Accès : {access.access}{access.inGrace ? " (grâce)" : ""}</span>}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm">
          {subscription?.currentPeriodEnd && (
            <p>Payé jusqu’au <strong>{new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" }).format(new Date(subscription.currentPeriodEnd))}</strong></p>
          )}
          {subscription?.trialEndsAt && subscription.status === "trialing" && (
            <p>Essai gratuit jusqu’au <strong>{new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" }).format(new Date(subscription.trialEndsAt))}</strong></p>
          )}
          {access && !access.allowed && (
            <p className="text-destructive">Accès restreint — régularisez votre paiement. Vos données sont conservées.</p>
          )}
          <CancelToggle initialCancelled={Boolean((subscription as { cancelAtPeriodEnd?: boolean } | null)?.cancelAtPeriodEnd)} />
          <p className="text-muted-foreground">Le paiement se fait hors application (Wave, Orange Money, espèces). L’activation intervient uniquement après vérification par l’administrateur.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Choisir une formule</CardTitle>
          <CardDescription>Les montants sont fixés côté serveur, en FCFA.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={createRequest}>
            <FieldGroup>
              <div className="grid gap-4 sm:grid-cols-3">
                <Field>
                  <FieldLabel>Formule</FieldLabel>
                  <Select value={planId} onValueChange={(v) => setPlanId(String(v))}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {plans.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
                <Field>
                  <FieldLabel>Période</FieldLabel>
                  <Select value={interval} onValueChange={(v) => setInterval(String(v))}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="monthly">Mensuel</SelectItem>
                      <SelectItem value="annual">Annuel</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field>
                  <FieldLabel>Moyen de paiement</FieldLabel>
                  <Select value={method} onValueChange={(v) => setMethod(String(v))}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(methodLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
              </div>
              {selectedPlan && (
                <p className="text-sm">Montant attendu : <strong>{price.toLocaleString("fr-FR")} FCFA</strong> {selectedPlan.description && <span className="text-muted-foreground">— {selectedPlan.description}</span>}</p>
              )}
              <FieldDescription>Une référence unique sera générée. Conservez-la pour votre paiement.</FieldDescription>
              <div><Button type="submit" disabled={creating || !planId}>{creating ? <Spinner data-icon="inline-start" /> : <Wallet data-icon="inline-start" />}Demander un paiement</Button></div>
            </FieldGroup>
          </form>
          {created && (
            <div className="mt-4 rounded-xl border p-4 text-sm">
              <p className="font-semibold">Référence : {created.reference} — {created.expectedAmountXof.toLocaleString("fr-FR")} FCFA</p>
              <InstructionsList instructions={instructions} method={created.method} />
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Clock className="size-4" />Demandes en cours ({pending.length})</CardTitle>
          <CardDescription>Signalez votre paiement après l’avoir effectué. Cela ne vaut pas preuve de paiement.</CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          {pending.length === 0 ? (
            <p className="px-6 py-4 text-sm text-muted-foreground">Aucune demande en attente.</p>
          ) : (
            <ul className="divide-y">
              {pending.map((r) => (
                <li key={r.id} className="flex flex-col gap-2 px-6 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-semibold">{r.reference} — {r.expectedAmountXof.toLocaleString("fr-FR")} FCFA ({methodLabels[r.method] ?? r.method})</p>
                    <p className="text-xs text-muted-foreground">Créée le {new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(new Date(r.createdAt))} — statut {r.status}</p>
                    <InstructionsList instructions={instructions} method={r.method} />
                  </div>
                  <Dialog open={notifyId === r.id} onOpenChange={(open) => { setNotifyId(open ? r.id : null); setNotifyMethod(r.method); }}>
                    <DialogTrigger render={<Button variant="outline" size="sm" />}>Signaler le paiement</DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Signaler le paiement {r.reference}</DialogTitle>
                        <DialogDescription>Décrivez le paiement effectué. L’activation attend la vérification.</DialogDescription>
                      </DialogHeader>
                      <form onSubmit={submitNotify}>
                        <FieldGroup>
                          <Field>
                            <FieldLabel>Moyen utilisé</FieldLabel>
                            <Select value={notifyMethod} onValueChange={(v) => setNotifyMethod(String(v))}>
                              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {Object.entries(methodLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </Field>
                          <div className="grid gap-4 sm:grid-cols-2">
                            <Field>
                              <FieldLabel>Référence transaction (si dispo)</FieldLabel>
                              <Input value={claimedRef} onChange={(e) => setClaimedRef(e.target.value)} placeholder="Ex. WAVE-XXXX" />
                            </Field>
                            <Field>
                              <FieldLabel>Date du paiement</FieldLabel>
                              <Input type="datetime-local" value={claimedDate} onChange={(e) => setClaimedDate(e.target.value)} />
                            </Field>
                          </div>
                          <Field>
                            <FieldLabel>Note (optionnel)</FieldLabel>
                            <textarea
                              value={note}
                              onChange={(e) => setNote(e.target.value)}
                              rows={3}
                              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                            />
                          </Field>
                          <Field>
                            <FieldLabel>Reçu / capture (JPG, PNG, WebP, PDF — 5 Mo max)</FieldLabel>
                            <Input type="file" accept=".jpg,.jpeg,.png,.webp,.pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
                          </Field>
                          <div className="flex justify-end">
                            <Button type="submit" disabled={notifying}>{notifying ? <Spinner data-icon="inline-start" /> : <Upload data-icon="inline-start" />}Envoyer</Button>
                          </div>
                        </FieldGroup>
                      </form>
                    </DialogContent>
                  </Dialog>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><BadgeCheck className="size-4" />Historique</CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          {requests.length === 0 ? (
            <p className="px-6 py-4 text-sm text-muted-foreground">Aucune demande pour le moment.</p>
          ) : (
            <ul className="divide-y">
              {requests.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-4 px-6 py-3 text-sm">
                  <div>
                    <p className="font-semibold">{r.reference} — {r.expectedAmountXof.toLocaleString("fr-FR")} FCFA</p>
                    {r.rejectReason && <p className="text-xs text-destructive">Motif du rejet : {r.rejectReason}</p>}
                  </div>
                  <StatusBadge status={r.status} />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function CancelToggle({ initialCancelled }: { initialCancelled: boolean }) {
  const [working, setWorking] = useState(false);
  const [cancelled, setCancelled] = useState(initialCancelled);

  async function toggle(cancel: boolean) {
    setWorking(true);
    try {
      await apiFetch("/api/billing/subscription/cancel", {
        method: "POST",
        body: JSON.stringify({ cancel }),
      });
      setCancelled(cancel);
      toast.success(cancel ? "Résiliation programmée en fin de période." : "Résiliation annulée.");
      window.location.reload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Action impossible.");
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2 pt-1">
      <Button variant="outline" size="sm" disabled={working} onClick={() => void toggle(!cancelled)}>
        {cancelled ? "Reprendre l'abonnement" : "Résilier en fin de période"}
      </Button>
      <span className="text-xs text-muted-foreground">Votre accès reste actif jusqu’à la fin payée. Réservé au propriétaire.</span>
    </div>
  );
}

function InstructionsList({ instructions, method }: { instructions: BillingInstruction[]; method: string }) {  const relevant = instructions.filter((i) => i.method === method);
  const list = relevant.length ? relevant : instructions.slice(0, 3);
  if (!list.length) return null;
  return (
    <ul className="mt-2 flex flex-col gap-1 text-xs text-muted-foreground">
      {list.map((i) => (
        <li key={i.id}>• {i.displayName ?? methodLabels[i.method] ?? i.method}{i.phoneNumber ? ` — ${i.phoneNumber}` : ""}{i.instructions ? ` : ${i.instructions}` : ""}</li>
      ))}
    </ul>
  );
}
