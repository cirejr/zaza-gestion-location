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
    receiptUrl: string | null;
    note: string | null;
    actualAmountXof: number | null;
    createdAt: string;
  };
  agencyName: string | null;
};

export function AdminBillingClient({ initialRequests }: { initialRequests: RequestRow[] }) {
  const [status, setStatus] = useState("notified");
  const [rows, setRows] = useState(initialRequests);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<RequestRow | null>(null);

  const [actualAmount, setActualAmount] = useState("");
  const [actualDate, setActualDate] = useState("");
  const [txRef, setTxRef] = useState("");
  const [adminNote, setAdminNote] = useState("");
  const [overrideReason, setOverrideReason] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [working, setWorking] = useState(false);

  async function refresh(nextStatus: string) {
    setLoading(true);
    try {
      const res = await apiFetch<{ data: RequestRow[] }>(`/api/admin/billing/requests?status=${nextStatus}`);
      setRows(res.data);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Chargement impossible.");
    } finally {
      setLoading(false);
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
      await refresh(status);
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
      setRejectReason("");
      await refresh(status);
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
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
        <CardTitle>Demandes de paiement</CardTitle>
        <div className="flex items-center gap-2">
          <Select value={status} onValueChange={(v) => { const s = String(v); setStatus(s); void refresh(s); }}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              {["pending", "notified", "confirmed", "rejected", "cancelled"].map((s) => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={() => void refresh(status)} disabled={loading}>
            {loading ? <Spinner data-icon="inline-start" /> : null}Actualiser
          </Button>
        </div>
      </CardHeader>
      <CardContent className="px-0">
        {rows.length === 0 ? (
          <p className="px-6 py-4 text-sm text-muted-foreground">Aucune demande avec ce statut.</p>
        ) : (
          <ul className="divide-y">
            {rows.map((row) => (
              <li key={row.request.id} className="flex flex-col gap-2 px-6 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-semibold">{row.request.reference} — {row.request.expectedAmountXof.toLocaleString("fr-FR")} FCFA</p>
                  <p className="text-xs text-muted-foreground">
                    {row.agencyName ?? row.request.agencyId} • {row.request.method} • {row.request.billingInterval}
                    {row.request.claimedRef ? ` • déclaré: ${row.request.claimedRef}` : ""}
                  </p>
                  {row.request.receiptUrl && (
                    <a className="text-xs underline" href={row.request.receiptUrl} target="_blank" rel="noreferrer">Voir le reçu</a>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={row.request.status} />
                  <Dialog open={selected?.request.id === row.request.id} onOpenChange={(open) => {
                    if (open) {
                      setSelected(row);
                      setActualAmount(String(row.request.expectedAmountXof));
                      setActualDate(new Date().toISOString().slice(0, 16));
                      setTxRef(row.request.claimedRef ?? "");
                    } else setSelected(null);
                  }}>
                    <DialogTrigger render={<Button variant="outline" size="sm" />}>Vérifier</DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Vérifier {row.request.reference}</DialogTitle>
                      </DialogHeader>
                      <p className="text-sm text-muted-foreground">
                        Attendu : <strong>{row.request.expectedAmountXof.toLocaleString("fr-FR")} XOF</strong>.
                        Vérifiez le paiement indépendamment (relevé Wave/Orange Money) avant de confirmer.
                      </p>
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
