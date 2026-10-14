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
import { METHODS, REQUEST_STATUSES, type RequestDetail, type RequestRow } from "./types";

export function RequestsPanel({ initialRequests }: { initialRequests: RequestRow[] }) {
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
        <div>
          <CardTitle>Demandes de paiement</CardTitle>
          <p className="text-sm text-muted-foreground">Vérifiez chaque versement sur vos relevés avant de confirmer. Un signalement ne prouve jamais un paiement.</p>
        </div>
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
