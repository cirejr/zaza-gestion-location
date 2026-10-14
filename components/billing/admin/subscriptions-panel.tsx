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
import { SUBSCRIPTION_STATUSES, type SubscriptionDetail, type SubscriptionRow } from "./types";

export function SubscriptionsPanel() {
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
        <div>
          <CardTitle>Abonnements ({rows.length})</CardTitle>
          <p className="text-sm text-muted-foreground">Un abonnement par agence. Toute modification manuelle est auditée avec sa raison.</p>
        </div>
        <Select value={status} onValueChange={(v) => setStatus(String(v))}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous</SelectItem>
            {SUBSCRIPTION_STATUSES.map((s) => (
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
