"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore, ArrowLeftRight, Download, Link2, Paperclip, Pencil, Plus, RefreshCw, Undo2, Wallet, X } from "lucide-react";
import { toast } from "sonner";
import { ApiError, apiFetch } from "@/lib/api";
import type {
  ApiAccountReconciliation,
  ApiApartment,
  ApiFinancialAccountWithBalance,
  ApiFinancialTransaction,
  ApiList,
  ApiTenant,
  FinancialAccountType,
  FinancialTransactionKind,
} from "@/lib/dashboard-types";
import { formatFcfa } from "@/lib/dashboard-utils";
import { parseAmountInput } from "@/lib/amount";
import { uploadFile } from "@/components/dashboard/create-dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AmountInput } from "@/components/ui/amount-input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type AccountOption = { id: string; name: string };
type BuildingOption = { id: string; name: string };

const accountTypeOptions: Array<{ value: FinancialAccountType; label: string }> = [
  { value: "cash", label: "Espèces" },
  { value: "wave", label: "Wave" },
  { value: "orange_money", label: "Orange Money" },
  { value: "mobile_money", label: "Mobile Money" },
  { value: "bank", label: "Banque" },
  { value: "other", label: "Autre" },
];

const kindLabels: Record<FinancialTransactionKind, string> = {
  rent: "Loyer",
  income: "Revenu",
  expense: "Dépense",
  transfer: "Virement",
  deposit: "Dépôt de garantie",
  deposit_refund: "Remb. dépôt",
  settlement: "Versement propriétaire",
  adjustment: "Ajustement",
  reversal: "Extourne",
};

function currentPeriod() {
  return new Date().toISOString().slice(0, 7);
}

export function LedgerWorkspace({ initialAccounts, buildings }: { initialAccounts: ApiFinancialAccountWithBalance[]; buildings: BuildingOption[] }) {
  const router = useRouter();
  const [accounts, setAccounts] = useState(initialAccounts);
  const [rows, setRows] = useState<ApiFinancialTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [filters, setFilters] = useState({ period: currentPeriod(), accountId: "", buildingId: "", kind: "" });
  const [error, setError] = useState<string | null>(null);

  const loadLedger = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const query = new URLSearchParams({ page: String(page), limit: "50" });
      if (filters.period) query.set("period", filters.period);
      if (filters.accountId) query.set("accountId", filters.accountId);
      if (filters.buildingId) query.set("buildingId", filters.buildingId);
      if (filters.kind) query.set("kind", filters.kind);
      const response = await apiFetch<{ data: ApiFinancialTransaction[]; pagination?: { total: number } }>(`/api/accounts/ledger?${query.toString()}`);
      setRows(response.data);
      setTotal(response.pagination?.total ?? response.data.length);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Impossible de charger le grand livre.");
    } finally {
      setLoading(false);
    }
  }, [filters, page]);

  useEffect(() => {
    void loadLedger();
  }, [loadLedger]);

  const reload = useCallback(async () => {
    try {
      const response = await apiFetch<{ data: ApiFinancialAccountWithBalance[] }>("/api/accounts");
      setAccounts(response.data);
    } catch {
      // A failed refresh leaves the last known balances in place.
    }
    await loadLedger();
    router.refresh();
  }, [loadLedger, router]);

  async function reverse(transaction: ApiFinancialTransaction) {
    const reason = window.prompt(`Motif de l’extourne de « ${transaction.description ?? kindLabels[transaction.kind]} » :`, "Erreur de saisie");
    if (reason === null) return;
    try {
      await apiFetch(`/api/accounts/transactions/${transaction.id}/reverse`, { method: "POST", body: JSON.stringify({ reason }) });
      toast.success("Écriture extournée.");
      await reload();
    } catch (requestError) {
      toast.error(requestError instanceof Error ? requestError.message : "Extourne impossible.");
    }
  }

  const totalBalance = accounts.reduce((sum, account) => sum + account.balance, 0);
  const pages = Math.max(1, Math.ceil(total / 50));
  // New movements never touch an archived account; history stays visible.
  const activeAccounts = accounts.filter((account) => account.status === "active");

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle>Comptes</CardTitle>
            <CardDescription>
              Solde total : <span className="font-bold text-foreground">{formatFcfa(totalBalance)}</span> sur {accounts.length} compte(s).
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <CreateAccountDialog buildings={buildings} onDone={reload} />
            <TransferDialog accounts={activeAccounts} onDone={reload} />
            <EntryDialog accounts={activeAccounts} buildings={buildings} onDone={reload} />
          </div>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {accounts.length === 0 && (
            <p className="text-sm text-muted-foreground">Aucun compte. Créez un compte Wave, Orange Money, banque ou caisse pour commencer.</p>
          )}
          {accounts.map((account) => (
            <div key={account.id} className="flex flex-col gap-2 rounded-xl border p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2">
                  <Wallet className="mt-0.5 size-4 text-muted-foreground" />
                  <div className="flex flex-col">
                    <span className="flex items-center gap-2 text-sm font-semibold">
                      {account.name}
                      {account.status === "archived" && <Badge variant="outline">Archivé</Badge>}
                    </span>
                    <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{account.type.replace("_", " ")}</span>
                    {account.buildingId && <span className="text-[10px] text-muted-foreground">Compte propriétaire</span>}
                  </div>
                </div>
                <span className={account.balance < 0 ? "text-sm font-bold text-destructive" : "text-sm font-bold"}>{formatFcfa(account.balance)}</span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <ReconcileAccountDialog account={account} onDone={reload} />
                <AccountArchiveButton account={account} onDone={reload} />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle>Mouvements</CardTitle>
            <CardDescription>{total} écriture(s). Les extournes conservent la trace d’origine.</CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => void reload()} disabled={loading}>
              {loading ? <Spinner data-icon="inline-start" /> : <RefreshCw data-icon="inline-start" />}
              Rafraîchir
            </Button>
            <Button
              variant="outline"
              render={<a href={`/api/reports/accounting/ledger?period=${filters.period}${filters.buildingId ? `&buildingId=${filters.buildingId}` : ""}&format=csv`} />}
            >
              <Download data-icon="inline-start" />
              Exporter CSV
            </Button>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field>
              <FieldLabel>Période</FieldLabel>
              <Input
                type="month"
                value={filters.period}
                onChange={(event) => {
                  setPage(1);
                  setFilters((current) => ({ ...current, period: event.target.value }));
                }}
              />
            </Field>
            <Field>
              <FieldLabel>Compte</FieldLabel>
              <Select
                value={filters.accountId || "__all__"}
                onValueChange={(value) => {
                  setPage(1);
                  setFilters((current) => ({ ...current, accountId: value === "__all__" ? "" : String(value) }));
                }}
                items={[{ value: "__all__", label: "Tous les comptes" }, ...accounts.map((account) => ({ value: account.id, label: account.name }))]}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="__all__">Tous les comptes</SelectItem>
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
              <FieldLabel>Immeuble</FieldLabel>
              <Select
                value={filters.buildingId || "__all__"}
                onValueChange={(value) => {
                  setPage(1);
                  setFilters((current) => ({ ...current, buildingId: value === "__all__" ? "" : String(value) }));
                }}
                items={[{ value: "__all__", label: "Tous les immeubles" }, ...buildings.map((building) => ({ value: building.id, label: building.name }))]}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="__all__">Tous les immeubles</SelectItem>
                    {buildings.map((building) => (
                      <SelectItem key={building.id} value={building.id}>
                        {building.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel>Type</FieldLabel>
              <Select
                value={filters.kind || "__all__"}
                onValueChange={(value) => {
                  setPage(1);
                  setFilters((current) => ({ ...current, kind: value === "__all__" ? "" : String(value) }));
                }}
                items={[{ value: "__all__", label: "Tous les types" }, ...(Object.keys(kindLabels) as FinancialTransactionKind[]).map((kind) => ({ value: kind, label: kindLabels[kind] }))]}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="__all__">Tous les types</SelectItem>
                    {(Object.keys(kindLabels) as FinancialTransactionKind[]).map((kind) => (
                      <SelectItem key={kind} value={kind}>
                        {kindLabels[kind]}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertTitle>Erreur</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Écriture</TableHead>
                <TableHead>Immeuble</TableHead>
                <TableHead>Compte</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Montant</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && !loading && (
                <TableRow>
                  <TableCell colSpan={8} className="h-24 text-center text-sm text-muted-foreground">
                    Aucun mouvement pour ces filtres.
                  </TableCell>
                </TableRow>
              )}
              {rows.map((transaction) => {
                const signed = transaction.flow === "in" ? Number(transaction.amount) : -Number(transaction.amount);
                return (
                  <TableRow key={transaction.id} className={transaction.status === "reversed" ? "opacity-60" : undefined}>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {new Date(transaction.postedAt).toLocaleDateString("fr-FR")}
                    </TableCell>
                    <TableCell className="max-w-[16rem]">
                      <span className="text-sm font-medium">{transaction.description ?? kindLabels[transaction.kind]}</span>
                      {transaction.supplier && <span className="block text-xs text-muted-foreground">{transaction.supplier}</span>}
                      {transaction.category && <span className="block text-[10px] uppercase tracking-wide text-muted-foreground">{transaction.category}</span>}
                      {transaction.reference && <span className="block text-[10px] text-muted-foreground">Réf. {transaction.reference}</span>}
                      {transaction.attachmentUrl && (
                        <a
                          href={transaction.attachmentUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
                        >
                          <Paperclip className="size-3" />
                          Justificatif
                        </a>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">{transaction.buildingName ?? "—"}</TableCell>
                    <TableCell className="text-xs">{transaction.accountName ?? (transaction.accountId ? "—" : "À rattacher")}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{kindLabels[transaction.kind]}</Badge>
                    </TableCell>
                    <TableCell className={signed < 0 ? "text-right font-semibold text-destructive" : "text-right font-semibold text-emerald-600"}>
                      {formatFcfa(signed)}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={transaction.status} />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {!transaction.accountId && transaction.status === "posted" && (
                          <ReconcileDialog transaction={transaction} accounts={activeAccounts} onDone={reload} />
                        )}
                        {transaction.status === "posted" && transaction.kind !== "reversal" && (
                          <>
                            <EditTransactionDialog transaction={transaction} onDone={reload} />
                            <Button variant="ghost" size="icon-sm" title="Extourner" aria-label="Extourner" onClick={() => void reverse(transaction)}>
                              <Undo2 />
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>

          {pages > 1 && (
            <div className="flex items-center justify-end gap-3 text-sm">
              <span className="text-xs text-muted-foreground">
                Page {page} / {pages}
              </span>
              <Button variant="outline" size="sm" disabled={page <= 1 || loading} onClick={() => setPage((value) => Math.max(1, value - 1))}>
                Précédent
              </Button>
              <Button variant="outline" size="sm" disabled={page >= pages || loading} onClick={() => setPage((value) => value + 1)}>
                Suivant
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * Compare an account's ledger-derived balance with an external provider
 * statement. The recorded balance is snapshotted per reconciliation so the
 * discrepancy stays visible even as later movements change the balance.
 */
function ReconcileAccountDialog({ account, onDone }: { account: ApiFinancialAccountWithBalance; onDone: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<ApiAccountReconciliation[]>([]);
  const [balance, setBalance] = useState(account.balance);
  const [form, setForm] = useState({ statementBalance: "", asOf: new Date().toISOString().slice(0, 10), notes: "" });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiFetch<{ data: ApiAccountReconciliation[]; account: { balance: number } }>(`/api/accounts/${account.id}/reconciliations`);
      setRows(response.data);
      setBalance(response.account.balance);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Chargement impossible.");
    } finally {
      setLoading(false);
    }
  }, [account.id]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const statement = parseAmountInput(form.statementBalance);
    if (statement == null) {
      setError("Saisissez le solde du relevé.");
      return;
    }
    setSaving(true);
    try {
      await apiFetch(`/api/accounts/${account.id}/reconciliations`, {
        method: "POST",
        body: JSON.stringify({ statementBalance: statement, asOf: form.asOf, ...(form.notes.trim() ? { notes: form.notes.trim() } : {}) }),
      });
      toast.success("Rapprochement enregistré.");
      setForm((current) => ({ ...current, statementBalance: "", notes: "" }));
      await load();
      await onDone();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Enregistrement impossible.");
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    try {
      await apiFetch(`/api/accounts/${account.id}/reconciliations/${id}`, { method: "DELETE" });
      await load();
    } catch (requestError) {
      toast.error(requestError instanceof Error ? requestError.message : "Suppression impossible.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="ghost" size="sm" className="self-start" />}>Rapprocher</DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Rapprochement — {account.name}</DialogTitle>
          <DialogDescription>
            Solde comptable calculé : <span className="font-semibold text-foreground">{formatFcfa(balance)}</span>. Saisissez le solde du relevé externe pour comparer.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <FieldGroup>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel>Solde du relevé *</FieldLabel>
                <AmountInput value={form.statementBalance} onValueChange={(value) => setForm((current) => ({ ...current, statementBalance: value }))} placeholder="0" />
              </Field>
              <Field>
                <FieldLabel>Date du relevé *</FieldLabel>
                <Input type="date" required value={form.asOf} onChange={(event) => setForm((current) => ({ ...current, asOf: event.target.value }))} />
              </Field>
            </div>
            <Field>
              <FieldLabel>Notes</FieldLabel>
              <Input value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} placeholder="Écart constaté, frais bancaires…" />
            </Field>
          </FieldGroup>
          {error && (
            <Alert variant="destructive">
              <AlertTitle>Erreur</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <DialogFooter>
            <Button type="submit" disabled={saving}>
              {saving ? <Spinner data-icon="inline-start" /> : null}
              Enregistrer
            </Button>
          </DialogFooter>
        </form>
        <div className="flex flex-col gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Historique</span>
          {loading && <Spinner />}
          {!loading && rows.length === 0 && <p className="text-sm text-muted-foreground">Aucun rapprochement enregistré.</p>}
          {rows.map((row) => {
            const gap = Number(row.statementBalance) - Number(row.recordedBalance);
            return (
              <div key={row.id} className="flex items-start justify-between gap-3 rounded-xl border p-3">
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm font-semibold">{formatFcfa(Number(row.statementBalance))}</span>
                  <span className="text-xs text-muted-foreground">
                    Comptable : {formatFcfa(Number(row.recordedBalance))} · {row.asOf}
                  </span>
                  {row.notes && <span className="text-xs text-muted-foreground">{row.notes}</span>}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Badge variant={gap === 0 ? "secondary" : "destructive"}>{gap === 0 ? "Concilié" : `Écart ${formatFcfa(gap)}`}</Badge>
                  <Button type="button" variant="ghost" size="icon-sm" aria-label="Supprimer le rapprochement" onClick={() => void remove(row.id)}>
                    <X />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CreateAccountDialog({ buildings, onDone }: { buildings: BuildingOption[]; onDone: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [values, setValues] = useState({
    name: "",
    type: "cash" as FinancialAccountType,
    provider: "",
    holder: "",
    maskedReference: "",
    openingBalance: "",
    openingDate: "",
    buildingId: "",
    notes: "",
  });

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const payload: Record<string, unknown> = { name: values.name.trim(), type: values.type };
      if (values.provider.trim()) payload.provider = values.provider.trim();
      if (values.holder.trim()) payload.holder = values.holder.trim();
      if (values.maskedReference.trim()) payload.maskedReference = values.maskedReference.trim();
      const opening = parseAmountInput(values.openingBalance);
      if (opening != null) payload.openingBalance = opening;
      if (values.openingDate) payload.openingDate = values.openingDate;
      if (values.buildingId) payload.buildingId = values.buildingId;
      if (values.notes.trim()) payload.notes = values.notes.trim();
      await apiFetch("/api/accounts", { method: "POST", body: JSON.stringify(payload) });
      toast.success("Compte créé.");
      setOpen(false);
      setValues({ name: "", type: "cash", provider: "", holder: "", maskedReference: "", openingBalance: "", openingDate: "", buildingId: "", notes: "" });
      await onDone();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Création impossible.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" />}>
        <Plus data-icon="inline-start" />
        Compte
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Nouveau compte</DialogTitle>
          <DialogDescription>Un compte lié à un immeuble détient l’argent de son propriétaire ; sinon c’est un compte de l’agence.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <FieldGroup>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel>Nom *</FieldLabel>
                <Input required value={values.name} onChange={(event) => setValues((current) => ({ ...current, name: event.target.value }))} placeholder="Caisse agence" />
              </Field>
              <Field>
                <FieldLabel>Type *</FieldLabel>
                <Select value={values.type} onValueChange={(value) => setValues((current) => ({ ...current, type: (value ?? "cash") as FinancialAccountType }))} items={accountTypeOptions}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {accountTypeOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel>Solde d’ouverture</FieldLabel>
                <AmountInput value={values.openingBalance} onValueChange={(value) => setValues((current) => ({ ...current, openingBalance: value }))} placeholder="0" />
              </Field>
              <Field>
                <FieldLabel>Date d’ouverture</FieldLabel>
                <Input type="date" value={values.openingDate} onChange={(event) => setValues((current) => ({ ...current, openingDate: event.target.value }))} />
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel>Titulaire</FieldLabel>
                <Input value={values.holder} onChange={(event) => setValues((current) => ({ ...current, holder: event.target.value }))} placeholder="Naya Immobilier" />
              </Field>
              <Field>
                <FieldLabel>Référence masquée</FieldLabel>
                <Input value={values.maskedReference} onChange={(event) => setValues((current) => ({ ...current, maskedReference: event.target.value }))} placeholder="**** 1234" />
              </Field>
            </div>
            <Field>
              <FieldLabel>Immeuble propriétaire (optionnel)</FieldLabel>
              <Select
                value={values.buildingId || "__none__"}
                onValueChange={(value) => setValues((current) => ({ ...current, buildingId: value === "__none__" ? "" : String(value) }))}
                items={[{ value: "__none__", label: "Compte de l’agence" }, ...buildings.map((building) => ({ value: building.id, label: building.name }))]}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="__none__">Compte de l’agence</SelectItem>
                    {buildings.map((building) => (
                      <SelectItem key={building.id} value={building.id}>
                        {building.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
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
              Créer le compte
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EntryDialog({ accounts, buildings, onDone }: { accounts: AccountOption[]; buildings: BuildingOption[]; onDone: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [values, setValues] = useState({
    kind: "expense" as Extract<FinancialTransactionKind, "income" | "expense" | "deposit" | "deposit_refund" | "adjustment">,
    accountId: "",
    amount: "",
    postingDate: new Date().toISOString().slice(0, 10),
    category: "",
    description: "",
    reference: "",
    supplier: "",
    attachmentUrl: "",
    buildingId: "",
    apartmentId: "",
    tenantId: "",
    chargeableTo: "agency" as "owner" | "agency",
  });
  const [uploading, setUploading] = useState(false);
  const [apartments, setApartments] = useState<Array<{ value: string; label: string }>>([]);
  const [tenants, setTenants] = useState<Array<{ value: string; label: string }>>([]);

  // Prospect/lease context: load the directory once, and the apartments of the
  // chosen building on demand so an expense can be attributed to one unit.
  useEffect(() => {
    if (!open) return;
    apiFetch<ApiList<ApiTenant>>("/api/tenants?limit=100")
      .then((response) => setTenants(response.data.map((tenant) => ({ value: tenant.id, label: tenant.fullName }))))
      .catch(() => setTenants([]));
  }, [open]);

  useEffect(() => {
    if (!open || !values.buildingId) {
      setApartments([]);
      return;
    }
    apiFetch<ApiList<ApiApartment>>(`/api/buildings/${values.buildingId}/apartments?limit=100`)
      .then((response) => setApartments(response.data.map((apartment) => ({ value: apartment.id, label: apartment.unitNumber }))))
      .catch(() => setApartments([]));
  }, [open, values.buildingId]);

  async function onReceiptSelected(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const url = await uploadFile(file, "receipts");
      setValues((current) => ({ ...current, attachmentUrl: url }));
    } catch {
      setError("Téléversement du justificatif impossible.");
    } finally {
      setUploading(false);
    }
  }

  const entryKinds = [
    { value: "income", label: "Encaissement (autre revenu)" },
    { value: "expense", label: "Dépense" },
    { value: "deposit", label: "Dépôt de garantie reçu" },
    { value: "deposit_refund", label: "Remboursement de dépôt" },
    { value: "adjustment", label: "Ajustement" },
  ];

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!values.accountId) {
      setError("Choisissez un compte.");
      return;
    }
    const amount = parseAmountInput(values.amount);
    if (!amount) {
      setError("Saisissez un montant.");
      return;
    }
    setLoading(true);
    try {
      const payload: Record<string, unknown> = {
        kind: values.kind,
        accountId: values.accountId,
        amount,
        postingDate: values.postingDate,
      };
      if (values.category.trim()) payload.category = values.category.trim();
      if (values.description.trim()) payload.description = values.description.trim();
      if (values.reference.trim()) payload.reference = values.reference.trim();
      if (values.supplier.trim()) payload.supplier = values.supplier.trim();
      if (values.attachmentUrl) payload.attachmentUrl = values.attachmentUrl;
      if (values.buildingId) payload.buildingId = values.buildingId;
      if (values.apartmentId) payload.apartmentId = values.apartmentId;
      if (values.tenantId) payload.tenantId = values.tenantId;
      if (values.kind === "expense") payload.chargeableTo = values.chargeableTo;
      await apiFetch("/api/accounts/entries", { method: "POST", body: JSON.stringify(payload) });
      toast.success("Écriture enregistrée.");
      setOpen(false);
      setValues((current) => ({ ...current, amount: "", category: "", description: "", reference: "", supplier: "", attachmentUrl: "", apartmentId: "", tenantId: "" }));
      await onDone();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Écriture impossible.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>
        <Plus data-icon="inline-start" />
        Écriture
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Nouvelle écriture</DialogTitle>
          <DialogDescription>Encaissement, dépense, dépôt de garantie ou ajustement. Les dépôts ne comptent pas comme revenus.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <FieldGroup>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel>Nature *</FieldLabel>
                <Select value={values.kind} onValueChange={(value) => setValues((current) => ({ ...current, kind: (value ?? "expense") as typeof current.kind }))} items={entryKinds}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {entryKinds.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel>Montant *</FieldLabel>
                <AmountInput value={values.amount} onValueChange={(value) => setValues((current) => ({ ...current, amount: value }))} placeholder="0" />
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel>Compte *</FieldLabel>
                <Select
                  value={values.accountId || "__none__"}
                  onValueChange={(value) => setValues((current) => ({ ...current, accountId: value === "__none__" ? "" : String(value) }))}
                  items={[{ value: "__none__", label: "Choisir un compte" }, ...accounts.map((account) => ({ value: account.id, label: account.name }))]}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Choisir un compte" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="__none__">Choisir un compte</SelectItem>
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
                <FieldLabel>Date *</FieldLabel>
                <Input type="date" required value={values.postingDate} onChange={(event) => setValues((current) => ({ ...current, postingDate: event.target.value }))} />
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel>Immeuble (optionnel)</FieldLabel>
                <Select
                  value={values.buildingId || "__none__"}
                  onValueChange={(value) => setValues((current) => ({ ...current, buildingId: value === "__none__" ? "" : String(value), apartmentId: "" }))}
                  items={[{ value: "__none__", label: "Aucun" }, ...buildings.map((building) => ({ value: building.id, label: building.name }))]}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="__none__">Aucun</SelectItem>
                      {buildings.map((building) => (
                        <SelectItem key={building.id} value={building.id}>
                          {building.name}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
              {values.buildingId && (
                <Field>
                  <FieldLabel>Unité (optionnel)</FieldLabel>
                  <Select
                    value={values.apartmentId || "__none__"}
                    onValueChange={(value) => setValues((current) => ({ ...current, apartmentId: value === "__none__" ? "" : String(value) }))}
                    items={[{ value: "__none__", label: "Aucune" }, ...apartments]}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value="__none__">Aucune</SelectItem>
                        {apartments.map((apartment) => (
                          <SelectItem key={apartment.value} value={apartment.value}>
                            {apartment.label}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>
              )}
              {tenants.length > 0 && (
                <Field>
                  <FieldLabel>Locataire lié (optionnel)</FieldLabel>
                  <Select
                    value={values.tenantId || "__none__"}
                    onValueChange={(value) => setValues((current) => ({ ...current, tenantId: value === "__none__" ? "" : String(value) }))}
                    items={[{ value: "__none__", label: "Aucun" }, ...tenants]}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value="__none__">Aucun</SelectItem>
                        {tenants.map((tenant) => (
                          <SelectItem key={tenant.value} value={tenant.value}>
                            {tenant.label}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>
              )}
              {values.kind === "expense" && (
                <Field>
                  <FieldLabel>À la charge de</FieldLabel>
                  <Select
                    value={values.chargeableTo}
                    onValueChange={(value) => setValues((current) => ({ ...current, chargeableTo: (value ?? "agency") as "owner" | "agency" }))}
                    items={[
                      { value: "agency", label: "Agence" },
                      { value: "owner", label: "Propriétaire" },
                    ]}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value="agency">Agence</SelectItem>
                        <SelectItem value="owner">Propriétaire</SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>
              )}
            </div>
            <Field>
              <FieldLabel>Catégorie</FieldLabel>
              <Input value={values.category} onChange={(event) => setValues((current) => ({ ...current, category: event.target.value }))} placeholder="Réparation, taxe, assurance…" />
            </Field>
            <Field>
              <FieldLabel>Libellé</FieldLabel>
              <Input value={values.description} onChange={(event) => setValues((current) => ({ ...current, description: event.target.value }))} placeholder="Réparation plomberie unité 3B" />
            </Field>
            <Field>
              <FieldLabel>Fournisseur / tiers (optionnel)</FieldLabel>
              <Input value={values.supplier} onChange={(event) => setValues((current) => ({ ...current, supplier: event.target.value }))} placeholder="Plombier, Sénélec, propriétaire…" />
            </Field>
            <Field>
              <FieldLabel>Justificatif (optionnel)</FieldLabel>
              <div className="flex items-center gap-2">
                <Input
                  type="file"
                  accept="image/*,application/pdf"
                  disabled={uploading}
                  onChange={(event) => void onReceiptSelected(event.target.files?.[0])}
                />
                {values.attachmentUrl && <span className="text-xs text-emerald-600">Fichier joint</span>}
              </div>
            </Field>
          </FieldGroup>
          {error && (
            <Alert variant="destructive">
              <AlertTitle>Impossible d’enregistrer</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <DialogFooter>
            <Button type="submit" disabled={loading || uploading}>
              {loading ? <Spinner data-icon="inline-start" /> : null}
              Enregistrer l’écriture
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function TransferDialog({ accounts, onDone }: { accounts: AccountOption[]; onDone: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [values, setValues] = useState({ fromAccountId: "", toAccountId: "", amount: "", postingDate: new Date().toISOString().slice(0, 10), reference: "", notes: "" });

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const amount = parseAmountInput(values.amount);
    if (!values.fromAccountId || !values.toAccountId) {
      setError("Choisissez les deux comptes.");
      return;
    }
    if (values.fromAccountId === values.toAccountId) {
      setError("Les deux comptes doivent être différents.");
      return;
    }
    if (!amount) {
      setError("Saisissez un montant.");
      return;
    }
    setLoading(true);
    try {
      await apiFetch("/api/accounts/transfer", {
        method: "POST",
        body: JSON.stringify({
          fromAccountId: values.fromAccountId,
          toAccountId: values.toAccountId,
          amount,
          postingDate: values.postingDate,
          ...(values.reference.trim() ? { reference: values.reference.trim() } : {}),
          ...(values.notes.trim() ? { notes: values.notes.trim() } : {}),
        }),
      });
      toast.success("Virement enregistré.");
      setOpen(false);
      setValues((current) => ({ ...current, amount: "", reference: "", notes: "" }));
      await onDone();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Virement impossible.");
    } finally {
      setLoading(false);
    }
  }

  const accountItems = [{ value: "__none__", label: "Choisir un compte" }, ...accounts.map((account) => ({ value: account.id, label: account.name }))];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" />}>
        <ArrowLeftRight data-icon="inline-start" />
        Virement
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Virement interne</DialogTitle>
          <DialogDescription>Déplace de l’argent d’un compte à l’autre. Les deux écritures sont liées et le total ne change pas.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <FieldGroup>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel>Depuis *</FieldLabel>
                <Select value={values.fromAccountId || "__none__"} onValueChange={(value) => setValues((current) => ({ ...current, fromAccountId: value === "__none__" ? "" : String(value) }))} items={accountItems}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choisir" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="__none__">Choisir</SelectItem>
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
                <FieldLabel>Vers *</FieldLabel>
                <Select value={values.toAccountId || "__none__"} onValueChange={(value) => setValues((current) => ({ ...current, toAccountId: value === "__none__" ? "" : String(value) }))} items={accountItems}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choisir" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="__none__">Choisir</SelectItem>
                      {accounts.map((account) => (
                        <SelectItem key={account.id} value={account.id}>
                          {account.name}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel>Montant *</FieldLabel>
                <AmountInput value={values.amount} onValueChange={(value) => setValues((current) => ({ ...current, amount: value }))} placeholder="0" />
              </Field>
              <Field>
                <FieldLabel>Date *</FieldLabel>
                <Input type="date" required value={values.postingDate} onChange={(event) => setValues((current) => ({ ...current, postingDate: event.target.value }))} />
              </Field>
            </div>
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
              Enregistrer le virement
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Archive hides a closed account from active use while keeping its history. */
function AccountArchiveButton({ account, onDone }: { account: ApiFinancialAccountWithBalance; onDone: () => Promise<void> }) {
  const [loading, setLoading] = useState(false);
  const archived = account.status === "archived";

  async function toggle() {
    setLoading(true);
    try {
      await apiFetch(`/api/accounts/${account.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: archived ? "active" : "archived" }),
      });
      toast.success(archived ? "Compte réactivé." : "Compte archivé.");
      await onDone();
    } catch (requestError) {
      toast.error(requestError instanceof Error ? requestError.message : "Opération impossible.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      className="self-start"
      disabled={loading}
      onClick={() => void toggle()}
      title={archived ? "Réactiver ce compte" : "Archiver ce compte"}
    >
      {loading ? <Spinner data-icon="inline-start" /> : archived ? <ArchiveRestore data-icon="inline-start" /> : <Archive data-icon="inline-start" />}
      {archived ? "Réactiver" : "Archiver"}
    </Button>
  );
}

/**
 * Correct a posted entry's descriptive fields. The amount, direction and kind are
 * deliberately not editable — those are reversed and re-entered — so the audit
 * trail is never rewritten (spec 2.4).
 */
function EditTransactionDialog({ transaction, onDone }: { transaction: ApiFinancialTransaction; onDone: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const initial = {
    category: transaction.category ?? "",
    description: transaction.description ?? "",
    reference: transaction.reference ?? "",
    supplier: transaction.supplier ?? "",
    chargeableTo: (transaction.chargeableTo ?? "agency") as "owner" | "agency",
  };
  const [values, setValues] = useState(initial);

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setError(null);
      setValues({
        category: transaction.category ?? "",
        description: transaction.description ?? "",
        reference: transaction.reference ?? "",
        supplier: transaction.supplier ?? "",
        chargeableTo: (transaction.chargeableTo ?? "agency") as "owner" | "agency",
      });
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const payload: Record<string, unknown> = {
        category: values.category.trim() || null,
        description: values.description.trim() || null,
        reference: values.reference.trim() || null,
        supplier: values.supplier.trim() || null,
      };
      if (transaction.kind === "expense") payload.chargeableTo = values.chargeableTo;
      await apiFetch(`/api/accounts/transactions/${transaction.id}`, { method: "PATCH", body: JSON.stringify(payload) });
      toast.success("Écriture modifiée.");
      setOpen(false);
      await onDone();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Modification impossible.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger render={<Button variant="ghost" size="icon-sm" title="Modifier" aria-label="Modifier" />}>
        <Pencil />
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Modifier le mouvement</DialogTitle>
          <DialogDescription>
            Corrigez les informations descriptives. Le montant et le sens ne se modifient pas : extournez l’écriture pour les corriger et préserver la piste d’audit.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <FieldGroup>
            <Field>
              <FieldLabel>Libellé</FieldLabel>
              <Input value={values.description} onChange={(event) => setValues((current) => ({ ...current, description: event.target.value }))} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel>Catégorie</FieldLabel>
                <Input value={values.category} onChange={(event) => setValues((current) => ({ ...current, category: event.target.value }))} />
              </Field>
              <Field>
                <FieldLabel>Référence</FieldLabel>
                <Input value={values.reference} onChange={(event) => setValues((current) => ({ ...current, reference: event.target.value }))} />
              </Field>
            </div>
            <Field>
              <FieldLabel>Fournisseur / tiers</FieldLabel>
              <Input value={values.supplier} onChange={(event) => setValues((current) => ({ ...current, supplier: event.target.value }))} />
            </Field>
            {transaction.kind === "expense" && (
              <Field>
                <FieldLabel>À la charge de</FieldLabel>
                <Select
                  value={values.chargeableTo}
                  onValueChange={(value) => setValues((current) => ({ ...current, chargeableTo: (value ?? "agency") as "owner" | "agency" }))}
                  items={[
                    { value: "agency", label: "Agence" },
                    { value: "owner", label: "Propriétaire" },
                  ]}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="agency">Agence</SelectItem>
                      <SelectItem value="owner">Propriétaire</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
            )}
          </FieldGroup>
          {error && (
            <Alert variant="destructive">
              <AlertTitle>Erreur</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <DialogFooter>
            <Button type="submit" disabled={loading}>
              {loading ? <Spinner data-icon="inline-start" /> : null}
              Enregistrer
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ReconcileDialog({ transaction, accounts, onDone }: { transaction: ApiFinancialTransaction; accounts: AccountOption[]; onDone: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [accountId, setAccountId] = useState("");

  async function submit() {
    if (!accountId) return;
    setLoading(true);
    try {
      await apiFetch(`/api/accounts/transactions/${transaction.id}`, { method: "PATCH", body: JSON.stringify({ accountId }) });
      toast.success("Écriture rattachée au compte.");
      setOpen(false);
      await onDone();
    } catch (requestError) {
      toast.error(requestError instanceof Error ? requestError.message : "Rattachement impossible.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="ghost" size="icon-sm" title="Rattacher à un compte" aria-label="Rattacher à un compte" />}>
        <Link2 />
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Rattacher le mouvement</DialogTitle>
          <DialogDescription>Indiquez dans quel compte cet encaissement a été reçu.</DialogDescription>
        </DialogHeader>
        <Field>
          <FieldLabel>Compte</FieldLabel>
          <Select
            value={accountId || "__none__"}
            onValueChange={(value) => setAccountId(value === "__none__" ? "" : String(value))}
            items={[{ value: "__none__", label: "Choisir un compte" }, ...accounts.map((account) => ({ value: account.id, label: account.name }))]}
          >
            <SelectTrigger>
              <SelectValue placeholder="Choisir un compte" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="__none__">Choisir un compte</SelectItem>
                {accounts.map((account) => (
                  <SelectItem key={account.id} value={account.id}>
                    {account.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
        <DialogFooter>
          <Button disabled={loading} onClick={() => void submit()}>
            {loading ? <Spinner data-icon="inline-start" /> : null}
            Rattacher
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
