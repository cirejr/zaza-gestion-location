"use client";

import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";

type RequestRow = {
  request: {
    id: string;
    agencyId: string;
    reference: string;
    billingInterval: string;
    expectedAmountXof: number;
    method: string;
    status: string;
    claimedRef: string | null;
    claimedPaidAt: string | null;
    note: string | null;
    receiptUrl: string | null;
    actualAmountXof: number | null;
    createdAt: string;
  };
  agencyName: string | null;
};

type RequestDetail = {
  request: RequestRow["request"];
  agency: { id: string; name: string; profile: { contactEmail: string | null; contactPhone: string | null } | null } | null;
  history: Array<{ id: string; kind: string; payload: unknown; createdAt: string }>;
  previous: Array<{ id: string; reference: string; status: string; expectedAmountXof: number; decidedAt: string | null }>;
};

type SubscriptionRow = {
  subscription: {
    id: string;
    agencyId: string;
    plan: string;
    amount: string;
    status: string;
    currentPeriodStart: string | null;
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
    suspendReason: string | null;
    updatedAt: string;
  };
  agencyName: string | null;
};

type SubscriptionDetail = {
  subscription: SubscriptionRow["subscription"];
  agency: { id: string; name: string; profile: { contactEmail: string | null; contactPhone: string | null } | null } | null;
  plan: { name: string } | null;
  history: Array<{ id: string; kind: string; payload: unknown; createdAt: string }>;
  paymentRecords: Array<{ id: string; reference: string; status: string; expectedAmountXof: number; actualAmountXof: number | null; createdAt: string }>;
};

const REQUEST_STATUSES = ["pending", "notified", "confirmed", "rejected", "cancelled"];
const METHODS = ["wave", "orange_money", "mtn_momo", "mobile_money", "cash"];

export function AdminBillingClient({ initialRequests }: { initialRequests: RequestRow[] }) {
  const [tab, setTab] = useState<"requests" | "subscriptions" | "catalog">("requests");
  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2">
        {(
          [
            ["requests", "Demandes"],
            ["subscriptions", "Abonnements"],
            ["catalog", "Formules & instructions"],
          ] as const
        ).map(([value, label]) => (
          <Button key={value} variant={tab === value ? "default" : "outline"} size="sm" onClick={() => setTab(value)}>
            {label}
          </Button>
        ))}
      </div>
      {tab === "requests" && <RequestsPanel initialRequests={initialRequests} />}
      {tab === "subscriptions" && <SubscriptionsPanel />}
      {tab === "catalog" && <CatalogPanel />}
    </div>
  );
}

function RequestsPanel({ initialRequests }: { initialRequests: RequestRow[] }) {
  const [status, setStatus] = useState("notified");
  const [method, setMethod] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [rows, setRows] = useState(initialRequests);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<RequestRow | null>(null);
  const [detail, setDetail] = useState<RequestDetail | null>(null);

  const [actualAmount, setActualAmount] = useState("");
  const [actualDate, setActualDate] = useState("");
  const [txRef, setTxRef] = useState("");
  const [adminNote, setAdminNote] = useState("");
  const [overrideReason, setOverrideReason] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [working, setWorking] = useState(false);

  async function refresh() {
    setLoading(true);
    try {
      const params = new URLSearchParams({ status });
      if (method !== "all") params.set("method", method);
      if (from) params.set("from", new Date(from).toISOString());
      if (to) params.set("to", new Date(to).toISOString());
      const res = await apiFetch<{ data: RequestRow[] }>(`/api/admin/billing/requests?${params}`);
      setRows(res.data);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Chargement impossible.");
    } finally {
      setLoading(false);
    }
  }

  async function openDetail(row: RequestRow) {
    setSelected(row);
    setActualAmount(String(row.request.expectedAmountXof));
    setActualDate(new Date().toISOString().slice(0, 16));
    setTxRef(row.request.claimedRef ?? "");
    try {
      const res = await apiFetch<{ data: RequestDetail }>(`/api/admin/billing/requests/${row.request.id}`);
      setDetail(res.data);
    } catch {
      setDetail(null);
    }
  }

  async function confirm(event: FormEvent, withOverride: boolean) {
    event.preventDefault();
    if (!selected) return;
    setWorking(true);
    try {
      await apiFetch(`/api/admin/billing/requests/${selected.request.id}/confirm`, {
        method: "POST",
        body: JSON.stringify({
          actualAmountXof: Number(actualAmount),
          actualPaidAt: new Date(actualDate).toISOString(),
          transactionRef: txRef || null,
          adminNote: adminNote || null,
          override: withOverride,
          overrideReason: overrideReason || null,
        }),
      });
      toast.success("Paiement confirmé, abonnement activé.");
      setSelected(null);
      setDetail(null);
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Confirmation impossible.");
    } finally {
      setWorking(false);
    }
  }

  async function reject(event: FormEvent) {
    event.preventDefault();
    if (!selected) return;
    setWorking(true);
    try {
      await apiFetch(`/api/admin/billing/requests/${selected.request.id}/reject`, {
        method: "POST",
        body: JSON.stringify({ reason: rejectReason }),
      });
      toast.success("Demande rejetée.");
      setSelected(null);
      setDetail(null);
      setRejectReason("");
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Rejet impossible.");
    } finally {
      setWorking(false);
    }
  }

  const discrepancy =
    selected && actualAmount !== "" && Number(actualAmount) !== selected.request.expectedAmountXof;

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3">
        <CardTitle>Demandes de paiement</CardTitle>
        <div className="flex flex-wrap items-end gap-2">
          <Field>
            <FieldLabel>Statut</FieldLabel>
            <Select value={status} onValueChange={(v) => setStatus(String(v))}>
              <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                {REQUEST_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel>Moyen</FieldLabel>
            <Select value={method} onValueChange={(v) => setMethod(String(v))}>
              <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous</SelectItem>
                {METHODS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel>Du</FieldLabel>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </Field>
          <Field>
            <FieldLabel>Au</FieldLabel>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </Field>
          <Button variant="outline" size="sm" onClick={() => void refresh()} disabled={loading}>
            {loading ? <Spinner data-icon="inline-start" /> : null}Filtrer
          </Button>
        </div>
      </CardHeader>
      <CardContent className="px-0">
        {rows.length === 0 ? (
          <p className="px-6 py-4 text-sm text-muted-foreground">Aucune demande avec ces filtres.</p>
        ) : (
          <ul className="divide-y">
            {rows.map((row) => (
              <li key={row.request.id} className="flex flex-col gap-2 px-6 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-semibold">{row.request.reference} — {row.request.expectedAmountXof.toLocaleString("fr-FR")} FCFA</p>
                  <p className="text-xs text-muted-foreground">
                    {row.agencyName ?? row.request.agencyId} • {row.request.method} • {row.request.billingInterval} •
                    soumise le {new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(new Date(row.request.createdAt))}
                    {row.request.claimedRef ? ` • déclaré: ${row.request.claimedRef}` : ""}
                  </p>
                  {row.request.receiptUrl && (
                    <a className="text-xs underline" href={row.request.receiptUrl} target="_blank" rel="noreferrer">Voir le reçu</a>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={row.request.status} />
                  <Dialog open={selected?.request.id === row.request.id} onOpenChange={(open) => {
                    if (open) void openDetail(row);
                    else { setSelected(null); setDetail(null); }
                  }}>
                    <DialogTrigger render={<Button variant="outline" size="sm" />}>Vérifier</DialogTrigger>
                    <DialogContent className="max-h-[90vh] overflow-y-auto">
                      <DialogHeader>
                        <DialogTitle>Vérifier {row.request.reference}</DialogTitle>
                      </DialogHeader>
                      <div className="rounded-md bg-muted p-3 text-xs">
                        <p><strong>Agence :</strong> {detail?.agency?.name ?? row.agencyName ?? row.request.agencyId}</p>
                        {detail?.agency?.profile && (
                          <p><strong>Contact :</strong> {detail.agency.profile.contactEmail ?? "—"} • {detail.agency.profile.contactPhone ?? "—"}</p>
                        )}
                        <p><strong>Formule :</strong> {row.request.billingInterval} — <strong>attendu : {row.request.expectedAmountXof.toLocaleString("fr-FR")} XOF</strong></p>
                        <p><strong>Moyen :</strong> {row.request.method} • <strong>Soumise le :</strong> {new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(row.request.createdAt))}</p>
                        {row.request.note && <p><strong>Note agence :</strong> {row.request.note}</p>}
                        <p className="mt-1 text-muted-foreground">Vérifiez le paiement indépendamment (relevé Wave/Orange Money) avant de confirmer.</p>
                      </div>
                      {(detail?.previous.length ?? 0) > 0 && (
                        <div className="text-xs">
                          <p className="font-semibold">Paiements confirmés précédents ({detail!.previous.length})</p>
                          <ul className="list-disc pl-5">
                            {detail!.previous.map((p) => (
                              <li key={p.id}>{p.reference} — {p.expectedAmountXof.toLocaleString("fr-FR")} XOF</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {(detail?.history.length ?? 0) > 0 && (
                        <div className="text-xs">
                          <p className="font-semibold">Décisions sur cette demande</p>
                          <ul className="list-disc pl-5">
                            {detail!.history.map((h) => (
                              <li key={h.id}>{h.kind} — {new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short" }).format(new Date(h.createdAt))}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {discrepancy && (
                        <p className="rounded-md bg-destructive/10 p-2 text-sm text-destructive">
                          Montant différent — la confirmation exige une décision explicite (override + raison).
                        </p>
                      )}
                      <form onSubmit={(e) => void confirm(e, Boolean(discrepancy))}>
                        <FieldGroup>
                          <div className="grid gap-4 sm:grid-cols-2">
                            <Field>
                              <FieldLabel>Montant réellement reçu (XOF)</FieldLabel>
                              <Input inputMode="numeric" value={actualAmount} onChange={(e) => setActualAmount(e.target.value)} required />
                            </Field>
                            <Field>
                              <FieldLabel>Date réelle du paiement</FieldLabel>
                              <Input type="datetime-local" value={actualDate} onChange={(e) => setActualDate(e.target.value)} required />
                            </Field>
                          </div>
                          <Field>
                            <FieldLabel>Référence transaction</FieldLabel>
                            <Input value={txRef} onChange={(e) => setTxRef(e.target.value)} />
                          </Field>
                          <Field>
                            <FieldLabel>Note interne</FieldLabel>
                            <Input value={adminNote} onChange={(e) => setAdminNote(e.target.value)} />
                          </Field>
                          {discrepancy && (
                            <Field>
                              <FieldLabel>Raison de l’écart (obligatoire)</FieldLabel>
                              <Input value={overrideReason} onChange={(e) => setOverrideReason(e.target.value)} required />
                            </Field>
                          )}
                          <div className="flex justify-end gap-2">
                            <Button type="submit" disabled={working}>{working ? <Spinner data-icon="inline-start" /> : null}Confirmer</Button>
                          </div>
                        </FieldGroup>
                      </form>
                      <form onSubmit={(e) => void reject(e)} className="mt-4 border-t pt-4">
                        <FieldGroup>
                          <Field>
                            <FieldLabel>Motif du rejet</FieldLabel>
                            <Input value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} required />
                          </Field>
                          <div className="flex justify-end">
                            <Button type="submit" variant="destructive" disabled={working}>Rejeter</Button>
                          </div>
                        </FieldGroup>
                      </form>
                    </DialogContent>
                  </Dialog>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function SubscriptionsPanel() {
  const [status, setStatus] = useState("all");
  const [rows, setRows] = useState<SubscriptionRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [selected, setSelected] = useState<SubscriptionRow | null>(null);
  const [detail, setDetail] = useState<SubscriptionDetail | null>(null);
  const [action, setAction] = useState("");
  const [reason, setReason] = useState("");
  const [months, setMonths] = useState("1");
  const [plan, setPlan] = useState("monthly");
  const [working, setWorking] = useState(false);

  async function refresh() {
    setLoading(true);
    try {
      const qs = status === "all" ? "" : `?status=${status}`;
      const res = await apiFetch<{ data: SubscriptionRow[] }>(`/api/admin/billing/subscriptions${qs}`);
      setRows(res.data);
      setLoaded(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Chargement impossible.");
    } finally {
      setLoading(false);
    }
  }

  async function openDetail(row: SubscriptionRow) {
    setSelected(row);
    setAction("");
    setReason("");
    try {
      const res = await apiFetch<{ data: SubscriptionDetail }>(`/api/admin/billing/subscriptions/${row.subscription.id}`);
      setDetail(res.data);
    } catch {
      setDetail(null);
    }
  }

  async function runAction(event: FormEvent) {
    event.preventDefault();
    if (!selected || !action) return;
    setWorking(true);
    try {
      const id = selected.subscription.id;
      if (action === "suspend" || action === "extend" || action === "change-plan") {
        if (!reason.trim()) throw new Error("Une raison est obligatoire pour cet ajustement.");
      }
      if (action === "suspend") {
        await apiFetch(`/api/admin/billing/subscriptions/${id}/suspend`, { method: "POST", body: JSON.stringify({ reason }) });
      } else if (action === "reactivate") {
        await apiFetch(`/api/admin/billing/subscriptions/${id}/reactivate`, { method: "POST" });
      } else if (action === "extend") {
        await apiFetch(`/api/admin/billing/subscriptions/${id}/extend`, { method: "POST", body: JSON.stringify({ months: Number(months), reason }) });
      } else if (action === "change-plan") {
        await apiFetch(`/api/admin/billing/subscriptions/${id}/change-plan`, { method: "POST", body: JSON.stringify({ plan, reason }) });
      }
      toast.success("Abonnement mis à jour (ajustement audité).");
      setSelected(null);
      setDetail(null);
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Action impossible.");
    } finally {
      setWorking(false);
    }
  }

  if (!loaded) {
    return (
      <Card>
        <CardContent className="py-6 text-sm">
          <Button variant="outline" onClick={() => void refresh()} disabled={loading}>
            {loading ? <Spinner data-icon="inline-start" /> : null}Charger les abonnements
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center gap-2">
        <CardTitle>Abonnements ({rows.length})</CardTitle>
        <Select value={status} onValueChange={(v) => setStatus(String(v))}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous</SelectItem>
            {["trialing", "pending_payment", "active", "past_due", "suspended", "cancelled", "expired"].map((s) => (
              <SelectItem key={s} value={s}>{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={() => void refresh()} disabled={loading}>Filtrer</Button>
      </CardHeader>
      <CardContent className="px-0">
        {rows.length === 0 ? (
          <p className="px-6 py-4 text-sm text-muted-foreground">Aucun abonnement.</p>
        ) : (
          <ul className="divide-y">
            {rows.map((row) => (
              <li key={row.subscription.id} className="flex flex-col gap-1 px-6 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-semibold">{row.agencyName ?? row.subscription.agencyId}</p>
                  <p className="text-xs text-muted-foreground">
                    {row.subscription.plan}
                    {row.subscription.currentPeriodEnd ? ` • payé jusqu’au ${new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(new Date(row.subscription.currentPeriodEnd))}` : ""}
                    {row.subscription.cancelAtPeriodEnd ? " • résiliation programmée" : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={row.subscription.status} />
                  <Dialog open={selected?.subscription.id === row.subscription.id} onOpenChange={(open) => {
                    if (open) void openDetail(row);
                    else { setSelected(null); setDetail(null); }
                  }}>
                    <DialogTrigger render={<Button variant="outline" size="sm" />}>Gérer</DialogTrigger>
                    <DialogContent className="max-h-[90vh] overflow-y-auto">
                      <DialogHeader>
                        <DialogTitle>{detail?.agency?.name ?? row.agencyName}</DialogTitle>
                      </DialogHeader>
                      {(detail?.history.length ?? 0) > 0 && (
                        <div className="text-xs">
                          <p className="font-semibold">Historique (immuable)</p>
                          <ul className="max-h-40 list-disc overflow-y-auto pl-5">
                            {detail!.history.map((h) => (
                              <li key={h.id}>{h.kind} — {new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short" }).format(new Date(h.createdAt))}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {(detail?.paymentRecords.length ?? 0) > 0 && (
                        <div className="text-xs">
                          <p className="font-semibold">Paiements liés</p>
                          <ul className="list-disc pl-5">
                            {detail!.paymentRecords.map((p) => (
                              <li key={p.id}>{p.reference} — {p.status} — {p.expectedAmountXof.toLocaleString("fr-FR")} XOF</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      <form onSubmit={(e) => void runAction(e)}>
                        <FieldGroup>
                          <Field>
                            <FieldLabel>Action</FieldLabel>
                            <Select value={action} onValueChange={(v) => setAction(String(v))}>
                              <SelectTrigger className="w-full"><SelectValue placeholder="Choisir…" /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="suspend">Suspendre (avec raison)</SelectItem>
                                <SelectItem value="reactivate">Réactiver</SelectItem>
                                <SelectItem value="extend">Prolonger (ajustement audité)</SelectItem>
                                <SelectItem value="change-plan">Changer de formule</SelectItem>
                              </SelectContent>
                            </Select>
                          </Field>
                          {action === "extend" && (
                            <Field>
                              <FieldLabel>Mois à ajouter</FieldLabel>
                              <Input inputMode="numeric" value={months} onChange={(e) => setMonths(e.target.value)} />
                            </Field>
                          )}
                          {action === "change-plan" && (
                            <Field>
                              <FieldLabel>Formule</FieldLabel>
                              <Select value={plan} onValueChange={(v) => setPlan(String(v))}>
                                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="monthly">Mensuel</SelectItem>
                                  <SelectItem value="annual">Annuel</SelectItem>
                                </SelectContent>
                              </Select>
                            </Field>
                          )}
                          <Field>
                            <FieldLabel>Raison administrative (obligatoire sauf réactivation)</FieldLabel>
                            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ex. geste commercial, erreur de saisie…" />
                          </Field>
                          <div className="flex justify-end">
                            <Button type="submit" disabled={working || !action}>{working ? <Spinner data-icon="inline-start" /> : null}Appliquer</Button>
                          </div>
                        </FieldGroup>
                      </form>
                    </DialogContent>
                  </Dialog>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

type PlanRow = { id: string; code: string; name: string; monthlyPriceXof: number; annualPriceXof: number; isActive: boolean };
type InstructionRow = { id: string; method: string; displayName: string | null; phoneNumber: string | null; instructions: string | null; isActive: boolean };

function CatalogPanel() {
  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [instructions, setInstructions] = useState<InstructionRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [monthly, setMonthly] = useState("");
  const [annual, setAnnual] = useState("");
  const [method, setMethod] = useState("wave");
  const [displayName, setDisplayName] = useState("");
  const [phone, setPhone] = useState("");
  const [text, setText] = useState("");
  const [working, setWorking] = useState(false);

  async function load() {
    try {
      const [p, i] = await Promise.all([
        apiFetch<{ data: PlanRow[] }>("/api/admin/billing/plans"),
        apiFetch<{ data: InstructionRow[] }>("/api/admin/billing/instructions"),
      ]);
      setPlans(p.data);
      setInstructions(i.data);
      setLoaded(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Chargement impossible.");
    }
  }

  async function savePlan(event: FormEvent) {
    event.preventDefault();
    setWorking(true);
    try {
      await apiFetch("/api/admin/billing/plans", {
        method: "POST",
        body: JSON.stringify({ code, name, monthlyPriceXof: Number(monthly), annualPriceXof: Number(annual), features: [], isActive: true }),
      });
      toast.success("Formule enregistrée.");
      setCode(""); setName(""); setMonthly(""); setAnnual("");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Enregistrement impossible.");
    } finally {
      setWorking(false);
    }
  }

  async function saveInstruction(event: FormEvent) {
    event.preventDefault();
    setWorking(true);
    try {
      await apiFetch("/api/admin/billing/instructions", {
        method: "POST",
        body: JSON.stringify({ method, displayName: displayName || null, phoneNumber: phone || null, instructions: text || null, sortOrder: 0, isActive: true }),
      });
      toast.success("Instruction enregistrée.");
      setDisplayName(""); setPhone(""); setText("");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Enregistrement impossible.");
    } finally {
      setWorking(false);
    }
  }

  if (!loaded) {
    return (
      <Card>
        <CardContent className="py-6 text-sm">
          <Button variant="outline" onClick={() => void load()}>Charger formules & instructions</Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader><CardTitle>Formules ({plans.length})</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-4">
          <ul className="divide-y text-sm">
            {plans.map((p) => (
              <li key={p.id} className="flex items-center justify-between py-2">
                <span className="font-medium">{p.name} ({p.code})</span>
                <span>{p.monthlyPriceXof.toLocaleString("fr-FR")} / {p.annualPriceXof.toLocaleString("fr-FR")} FCFA {p.isActive ? "" : "• inactive"}</span>
              </li>
            ))}
          </ul>
          <form onSubmit={(e) => void savePlan(e)}>
            <FieldGroup>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field><FieldLabel>Code</FieldLabel><Input value={code} onChange={(e) => setCode(e.target.value)} required /></Field>
                <Field><FieldLabel>Nom</FieldLabel><Input value={name} onChange={(e) => setName(e.target.value)} required /></Field>
                <Field><FieldLabel>Prix mensuel (XOF)</FieldLabel><Input inputMode="numeric" value={monthly} onChange={(e) => setMonthly(e.target.value)} required /></Field>
                <Field><FieldLabel>Prix annuel (XOF)</FieldLabel><Input inputMode="numeric" value={annual} onChange={(e) => setAnnual(e.target.value)} required /></Field>
              </div>
              <div><Button type="submit" size="sm" disabled={working}>Enregistrer la formule</Button></div>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Instructions de paiement ({instructions.length})</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-4">
          <ul className="divide-y text-sm">
            {instructions.map((i) => (
              <li key={i.id} className="py-2">
                <p className="font-medium">{i.method} — {i.displayName ?? "—"} {i.phoneNumber ? `• ${i.phoneNumber}` : ""}</p>
                {i.instructions && <p className="text-xs text-muted-foreground">{i.instructions}</p>}
              </li>
            ))}
          </ul>
          <form onSubmit={(e) => void saveInstruction(e)}>
            <FieldGroup>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field>
                  <FieldLabel>Moyen</FieldLabel>
                  <Select value={method} onValueChange={(v) => setMethod(String(v))}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {METHODS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
                <Field><FieldLabel>Nom affiché</FieldLabel><Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Ex. Naya — Wave" /></Field>
                <Field><FieldLabel>Téléphone destinataire</FieldLabel><Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+221 …" /></Field>
                <Field><FieldLabel>Instructions</FieldLabel><Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Comment payer…" /></Field>
              </div>
              <div><Button type="submit" size="sm" disabled={working}>Enregistrer l’instruction</Button></div>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
