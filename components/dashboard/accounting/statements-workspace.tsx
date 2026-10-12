"use client";

import { useState, type FormEvent } from "react";
import { Download, Eye, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import type { ApiOwnerSettlement, ApiOwnerStatement } from "@/lib/dashboard-types";
import { formatFcfa } from "@/lib/dashboard-utils";
import { parseAmountInput } from "@/lib/amount";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AmountInput } from "@/components/ui/amount-input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type Option = { id: string; name: string };

function currentPeriod() {
  return new Date().toISOString().slice(0, 7);
}

export function StatementsWorkspace({
  initialStatements,
  initialSettlements,
  accounts,
  buildings,
}: {
  initialStatements: ApiOwnerStatement[];
  initialSettlements: ApiOwnerSettlement[];
  accounts: Array<{ id: string; name: string }>;
  buildings: Array<{ id: string; name: string }>;
}) {
  const [statements, setStatements] = useState(initialStatements);
  const [settlements, setSettlements] = useState(initialSettlements);
  const [exportPeriod, setExportPeriod] = useState(currentPeriod);
  const [detail, setDetail] = useState<ApiOwnerStatement | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [settleTarget, setSettleTarget] = useState<ApiOwnerStatement | null>(null);

  async function reload() {
    try {
      const [statementResponse, settlementResponse] = await Promise.all([
        apiFetch<{ data: ApiOwnerStatement[] }>("/api/accounts/statements"),
        apiFetch<{ data: ApiOwnerSettlement[] }>("/api/accounts/settlements"),
      ]);
      setStatements(statementResponse.data);
      setSettlements(settlementResponse.data);
    } catch {
      // Keep the last known lists.
    }
  }

  async function openDetail(statement: ApiOwnerStatement) {
    setDetail(statement);
    try {
      const response = await apiFetch<{ data: ApiOwnerStatement }>(`/api/accounts/statements/${statement.id}`);
      setDetail(response.data);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Détail indisponible.");
    }
  }

  async function finalize(statement: ApiOwnerStatement) {
    try {
      await apiFetch(`/api/accounts/statements/${statement.id}/finalize`, { method: "POST" });
      toast.success("Relevé finalisé.");
      await reload();
      setDetail(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Finalisation impossible.");
    }
  }

  async function remove(statement: ApiOwnerStatement) {
    if (!window.confirm(`Supprimer le relevé ${statement.period} ?`)) return;
    try {
      await apiFetch(`/api/accounts/statements/${statement.id}`, { method: "DELETE" });
      toast.success("Relevé supprimé.");
      await reload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Suppression impossible.");
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <GenerateStatementCard buildings={buildings} onDone={reload} />

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <CardTitle>Relevés émis</CardTitle>
            <CardDescription>{statements.length} relevé(s). Un relevé finalisé n’est plus recalculable.</CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Input type="month" className="w-40" value={exportPeriod} onChange={(event) => setExportPeriod(event.target.value)} />
            <Button variant="outline" render={<a href={`/api/reports/accounting/statements?period=${exportPeriod}&format=csv`} />}>
              <Download data-icon="inline-start" />
              Exporter CSV
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {statements.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucun relevé. Générez-en un pour un immeuble et une période.</p>
          ) : (
            <div className="flex flex-col gap-3">
              {statements.map((statement) => (
                <div key={statement.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3">
                  <div className="flex flex-col">
                    <span className="text-sm font-semibold">
                      {statement.buildingName} · {statement.period}
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      Net à verser {formatFcfa(statement.netPayable)} · Versé {formatFcfa(statement.remitted)} · Reste{" "}
                      <span className={Number(statement.remaining) > 0 ? "font-bold text-destructive" : "font-bold"}>{formatFcfa(statement.remaining)}</span>
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {statement.status === "finalized" ? (
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Finalisé</span>
                    ) : (
                      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Brouillon</span>
                    )}
                    <Button variant="outline" size="sm" onClick={() => void openDetail(statement)}>
                      <Eye data-icon="inline-start" />
                      Détails
                    </Button>
                    <Button variant="default" size="sm" onClick={() => setSettleTarget(statement)}>
                      Verser
                    </Button>
                    {statement.status === "draft" && (
                      <>
                        <Button variant="outline" size="sm" onClick={() => void finalize(statement)}>
                          Finaliser
                        </Button>
                        <Button variant="ghost" size="icon-sm" title="Supprimer" aria-label="Supprimer" onClick={() => void remove(statement)}>
                          <Trash2 />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <CardTitle>Versements aux propriétaires</CardTitle>
            <CardDescription>Chaque versement sort de la trésorerie sans être une dépense d’exploitation.</CardDescription>
          </div>
          <Button variant="outline" render={<a href={`/api/reports/accounting/settlements?period=${exportPeriod}&format=csv`} />}>
            <Download data-icon="inline-start" />
            Exporter CSV
          </Button>
        </CardHeader>
        <CardContent>
          {settlements.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucun versement enregistré.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {settlements.map((settlement) => (
                <div key={settlement.id} className="flex items-center justify-between gap-3 rounded-lg border p-2 text-sm">
                  <div className="flex flex-col">
                    <span className="font-semibold">
                      {settlement.recipientName} · {settlement.buildingName}
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      {settlement.period} · {new Date(settlement.paidAt).toLocaleDateString("fr-FR")} {settlement.accountName ? `· ${settlement.accountName}` : ""}
                    </span>
                  </div>
                  <span className="font-bold">{formatFcfa(settlement.amount)}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {detail && <StatementDetailDialog statement={detail} onClose={() => setDetail(null)} onFinalize={() => void finalize(detail)} onSettle={() => { setSettleTarget(detail); setDetail(null); }} />}
      {settleTarget && (
        <SettleDialog
          statement={settleTarget}
          accounts={accounts}
          onDone={async () => {
            setSettleTarget(null);
            await reload();
          }}
          onClose={() => setSettleTarget(null)}
        />
      )}
    </div>
  );
}

function GenerateStatementCard({ buildings, onDone }: { buildings: Array<{ id: string; name: string }>; onDone: () => Promise<void> }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [buildingId, setBuildingId] = useState("");
  const [period, setPeriod] = useState(new Date().toISOString().slice(0, 7));

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!buildingId) {
      setError("Choisissez un immeuble.");
      return;
    }
    setLoading(true);
    try {
      await apiFetch("/api/accounts/statements", { method: "POST", body: JSON.stringify({ buildingId, period }) });
      toast.success("Relevé généré.");
      await onDone();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Génération impossible.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Générer un relevé</CardTitle>
        <CardDescription>Le relevé reprend les loyers encaissés, revenus, dépenses à charge du propriétaire et frais de gestion de la période.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="flex flex-col gap-4 sm:flex-row sm:items-end">
          <Field className="flex-1">
            <FieldLabel>Immeuble</FieldLabel>
            <Select
              value={buildingId || "__none__"}
              onValueChange={(value) => setBuildingId(value === "__none__" ? "" : String(value))}
              items={[{ value: "__none__", label: "Choisir un immeuble" }, ...buildings.map((building) => ({ value: building.id, label: building.name }))]}
            >
              <SelectTrigger>
                <SelectValue placeholder="Choisir un immeuble" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="__none__">Choisir un immeuble</SelectItem>
                  {buildings.map((building) => (
                    <SelectItem key={building.id} value={building.id}>
                      {building.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
          <Field className="sm:w-44">
            <FieldLabel>Période</FieldLabel>
            <Input type="month" value={period} onChange={(event) => setPeriod(event.target.value)} />
          </Field>
          <Button type="submit" disabled={loading}>
            {loading ? <Spinner data-icon="inline-start" /> : <Plus data-icon="inline-start" />}
            Générer
          </Button>
        </form>
        {error && (
          <Alert variant="destructive" className="mt-4">
            <AlertTitle>Impossible de générer</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}

function StatementDetailDialog({ statement, onClose, onFinalize, onSettle }: { statement: ApiOwnerStatement; onClose: () => void; onFinalize: () => void; onSettle: () => void }) {
  const lines = statement.lines ?? [];
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            Relevé {statement.buildingName} — {statement.period}
          </DialogTitle>
          <DialogDescription>{statement.basis ?? ""}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col divide-y rounded-xl border">
            {lines.map((line) => (
              <div key={line.id} className="flex items-center justify-between px-3 py-2 text-sm">
                <span className={line.lineType === "net" ? "font-bold" : "text-muted-foreground"}>{line.label}</span>
                <span className={Number(line.amount) < 0 ? "font-semibold text-destructive" : "font-semibold"}>{formatFcfa(line.amount)}</span>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-3 gap-3 text-sm">
            <div className="rounded-lg border p-3">
              <p className="text-[10px] uppercase text-muted-foreground">Net dû</p>
              <p className="font-bold">{formatFcfa(statement.netPayable)}</p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-[10px] uppercase text-muted-foreground">Versé</p>
              <p className="font-bold">{formatFcfa(statement.remitted)}</p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-[10px] uppercase text-muted-foreground">Reste</p>
              <p className={Number(statement.remaining) > 0 ? "font-bold text-destructive" : "font-bold"}>{formatFcfa(statement.remaining)}</p>
            </div>
          </div>
          {statement.settlements && statement.settlements.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Versements</p>
              {statement.settlements.map((settlement) => (
                <div key={settlement.id} className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">
                    {new Date(settlement.paidAt).toLocaleDateString("fr-FR")} · {settlement.recipientName}
                  </span>
                  <span className="font-semibold">{formatFcfa(settlement.amount)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <DialogFooter className="flex-row justify-between gap-2 sm:justify-between">
          <div className="flex gap-2">
            <Button variant="outline" render={<a href={`/api/accounts/statements/${statement.id}/pdf`} />}>
              <Download data-icon="inline-start" />
              PDF
            </Button>
            <Button variant="outline" onClick={onSettle}>
              Enregistrer un versement
            </Button>
          </div>
          {statement.status !== "finalized" && (
            <Button onClick={onFinalize}>
              Finaliser le relevé
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SettleDialog({
  statement,
  accounts,
  onDone,
  onClose,
}: {
  statement: ApiOwnerStatement;
  accounts: Array<{ id: string; name: string }>;
  onDone: () => Promise<void>;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [values, setValues] = useState({
    amount: statement.remaining && Number(statement.remaining) > 0 ? String(Math.round(Number(statement.remaining))) : "",
    paidAt: new Date().toISOString().slice(0, 10),
    accountId: "",
    reference: "",
    notes: "",
  });

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const amount = parseAmountInput(values.amount);
    if (!amount) {
      setError("Saisissez un montant.");
      return;
    }
    setLoading(true);
    try {
      await apiFetch("/api/accounts/settlements", {
        method: "POST",
        body: JSON.stringify({
          buildingId: statement.buildingId,
          period: statement.period,
          amount,
          paidAt: values.paidAt,
          ...(values.accountId ? { accountId: values.accountId } : {}),
          ...(values.reference.trim() ? { reference: values.reference.trim() } : {}),
          ...(values.notes.trim() ? { notes: values.notes.trim() } : {}),
        }),
      });
      toast.success("Versement enregistré.");
      await onDone();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Versement impossible.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Versement au propriétaire</DialogTitle>
          <DialogDescription>
            {statement.buildingName} — {statement.period}. Reste à verser {formatFcfa(statement.remaining)}.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <FieldGroup>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel>Montant *</FieldLabel>
                <AmountInput value={values.amount} onValueChange={(value) => setValues((current) => ({ ...current, amount: value }))} placeholder="0" />
              </Field>
              <Field>
                <FieldLabel>Date *</FieldLabel>
                <Input type="date" required value={values.paidAt} onChange={(event) => setValues((current) => ({ ...current, paidAt: event.target.value }))} />
              </Field>
            </div>
            <Field>
              <FieldLabel>Compte source</FieldLabel>
              <Select
                value={values.accountId || "__none__"}
                onValueChange={(value) => setValues((current) => ({ ...current, accountId: value === "__none__" ? "" : String(value) }))}
                items={[{ value: "__none__", label: "Aucun (hors trésorerie)" }, ...accounts.map((account) => ({ value: account.id, label: account.name }))]}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="__none__">Aucun (hors trésorerie)</SelectItem>
                    {accounts.map((account) => (
                      <SelectItem key={account.id} value={account.id}>
                        {account.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel>Référence</FieldLabel>
              <Input value={values.reference} onChange={(event) => setValues((current) => ({ ...current, reference: event.target.value }))} placeholder="N° de transaction" />
            </Field>
          </FieldGroup>
          {error && (
            <Alert variant="destructive">
              <AlertTitle>Impossible d’enregistrer</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <DialogFooter>
            <Button type="submit" disabled={loading}>
              {loading ? <Spinner data-icon="inline-start" /> : null}
              Enregistrer le versement
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
