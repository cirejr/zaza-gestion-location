"use client";

import { Pencil, Plus, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import { parseAmountInput } from "@/lib/amount";
import type { ApiManagementArrangement, ManagementFeeBasis } from "@/lib/dashboard-types";
import { formatFcfa } from "@/lib/dashboard-utils";
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
} from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type BuildingOption = { id: string; name: string };

const basisLabels: Record<ManagementFeeBasis, string> = {
  percent_collected: "Pourcentage des loyers encaissés",
  percent_due: "Pourcentage des loyers facturés",
  fixed: "Montant fixe par période",
  percent_collected_plus_fixed: "Pourcentage encaissé + montant fixe",
};

function basisNeedsPercent(basis: ManagementFeeBasis) {
  return basis === "percent_collected" || basis === "percent_due" || basis === "percent_collected_plus_fixed";
}

function basisNeedsFixed(basis: ManagementFeeBasis) {
  return basis === "fixed" || basis === "percent_collected_plus_fixed";
}

function describeFee(arrangement: ApiManagementArrangement) {
  const parts: string[] = [];
  if (basisNeedsPercent(arrangement.basis) && arrangement.feePercent !== null && arrangement.feePercent !== undefined) {
    parts.push(`${Number(arrangement.feePercent)} %`);
  }
  if (basisNeedsFixed(arrangement.basis) && arrangement.feeAmount !== null && arrangement.feeAmount !== undefined) {
    parts.push(formatFcfa(arrangement.feeAmount));
  }
  return parts.length > 0 ? parts.join(" + ") : "—";
}

export function ArrangementsWorkspace({
  initialArrangements,
  buildings,
}: {
  initialArrangements: ApiManagementArrangement[];
  buildings: BuildingOption[];
}) {
  const [arrangements, setArrangements] = useState(initialArrangements);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ApiManagementArrangement | null>(null);

  async function reload() {
    try {
      const response = await apiFetch<{ data: ApiManagementArrangement[] }>("/api/accounts/arrangements");
      setArrangements(response.data);
    } catch {
      // Keep the last known list.
    }
  }

  async function remove(arrangement: ApiManagementArrangement) {
    const building = arrangement.buildingName ?? "cet immeuble";
    if (!window.confirm(`Supprimer le mandat de gestion de ${building} prenant effet le ${arrangement.startDate} ?`)) return;
    try {
      await apiFetch(`/api/accounts/arrangements/${arrangement.id}`, { method: "DELETE" });
      toast.success("Mandat supprimé.");
      await reload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Suppression impossible.");
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <CardTitle>Mandats de gestion</CardTitle>
            <CardDescription>
              Définissez la rémunération de l’agence par immeuble (base et dates d’effet). Les relevés et la vue comptable appliquent le mandat en vigueur sur la période.
            </CardDescription>
          </div>
          <Button
            onClick={() => {
              setEditing(null);
              setDialogOpen(true);
            }}
          >
            <Plus data-icon="inline-start" />
            Nouveau mandat
          </Button>
        </CardHeader>
        <CardContent>
          {arrangements.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Aucun mandat. Sans mandat en vigueur, les frais de gestion sont calculés à 0.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Immeuble</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Période d’effet</TableHead>
                  <TableHead>Base</TableHead>
                  <TableHead>Rémunération</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {arrangements.map((arrangement) => (
                  <TableRow key={arrangement.id}>
                    <TableCell className="font-semibold">{arrangement.buildingName ?? "—"}</TableCell>
                    <TableCell>
                      {arrangement.ownerKind === "third_party" ? (
                        <Badge variant="outline">Tiers</Badge>
                      ) : (
                        <Badge variant="secondary">Interne</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {arrangement.startDate} → {arrangement.endDate ?? "en cours"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{basisLabels[arrangement.basis]}</TableCell>
                    <TableCell className="font-semibold">{describeFee(arrangement)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="outline"
                          size="icon-sm"
                          title="Modifier"
                          aria-label="Modifier"
                          onClick={() => {
                            setEditing(arrangement);
                            setDialogOpen(true);
                          }}
                        >
                          <Pencil />
                        </Button>
                        <Button variant="ghost" size="icon-sm" title="Supprimer" aria-label="Supprimer" onClick={() => void remove(arrangement)}>
                          <Trash2 />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {dialogOpen && (
        <ArrangementDialog
          arrangement={editing}
          buildings={buildings}
          onClose={() => setDialogOpen(false)}
          onDone={async () => {
            setDialogOpen(false);
            await reload();
          }}
        />
      )}
    </div>
  );
}

function ArrangementDialog({
  arrangement,
  buildings,
  onDone,
  onClose,
}: {
  arrangement: ApiManagementArrangement | null;
  buildings: BuildingOption[];
  onDone: () => Promise<void>;
  onClose: () => void;
}) {
  const isEdit = arrangement !== null;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [values, setValues] = useState({
    buildingId: arrangement?.buildingId ?? "",
    startDate: arrangement?.startDate ?? new Date().toISOString().slice(0, 10),
    endDate: arrangement?.endDate ?? "",
    basis: (arrangement?.basis ?? "percent_collected") as ManagementFeeBasis,
    feePercent: arrangement?.feePercent != null ? String(Number(arrangement.feePercent)) : "",
    feeAmount: arrangement?.feeAmount != null ? String(Math.round(Number(arrangement.feeAmount))) : "",
  });

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!isEdit && !values.buildingId) {
      setError("Choisissez un immeuble.");
      return;
    }
    if (basisNeedsPercent(values.basis) && values.feePercent.trim() === "") {
      setError("Saisissez le pourcentage de frais.");
      return;
    }
    if (basisNeedsFixed(values.basis) && values.feeAmount.trim() === "") {
      setError("Saisissez le montant fixe.");
      return;
    }
    setLoading(true);
    try {
      const feePercent = basisNeedsPercent(values.basis) ? Number(values.feePercent) : null;
      const feeAmount = basisNeedsFixed(values.basis) ? parseAmountInput(values.feeAmount) : null;
      const payload = {
        ...(isEdit ? {} : { buildingId: values.buildingId }),
        startDate: values.startDate,
        endDate: values.endDate.trim() === "" ? null : values.endDate,
        basis: values.basis,
        feePercent,
        feeAmount,
      };
      await apiFetch(isEdit ? `/api/accounts/arrangements/${arrangement.id}` : "/api/accounts/arrangements", {
        method: isEdit ? "PATCH" : "POST",
        body: JSON.stringify(payload),
      });
      toast.success(isEdit ? "Mandat mis à jour." : "Mandat créé.");
      await onDone();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Enregistrement impossible.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Modifier le mandat" : "Nouveau mandat de gestion"}</DialogTitle>
          <DialogDescription>
            Un mandat couvre une période d’effet. Deux mandats d’un même immeuble ne peuvent pas se chevaucher.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <FieldGroup>
            {!isEdit && (
              <Field>
                <FieldLabel>Immeuble *</FieldLabel>
                <Select
                  value={values.buildingId || "__none__"}
                  onValueChange={(value) => setValues((current) => ({ ...current, buildingId: value === "__none__" ? "" : String(value) }))}
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
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel>Début d’effet *</FieldLabel>
                <Input type="date" required value={values.startDate} onChange={(event) => setValues((current) => ({ ...current, startDate: event.target.value }))} />
              </Field>
              <Field>
                <FieldLabel>Fin (laisser vide si en cours)</FieldLabel>
                <Input type="date" value={values.endDate} onChange={(event) => setValues((current) => ({ ...current, endDate: event.target.value }))} />
              </Field>
            </div>
            <Field>
              <FieldLabel>Base de rémunération *</FieldLabel>
              <Select
                value={values.basis}
                onValueChange={(value) => setValues((current) => ({ ...current, basis: (value ?? "percent_collected") as ManagementFeeBasis }))}
                items={(Object.keys(basisLabels) as ManagementFeeBasis[]).map((basis) => ({ value: basis, label: basisLabels[basis] }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {(Object.keys(basisLabels) as ManagementFeeBasis[]).map((basis) => (
                      <SelectItem key={basis} value={basis}>
                        {basisLabels[basis]}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              {basisNeedsPercent(values.basis) && (
                <Field>
                  <FieldLabel>Pourcentage (%) *</FieldLabel>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    step="0.5"
                    value={values.feePercent}
                    onChange={(event) => setValues((current) => ({ ...current, feePercent: event.target.value }))}
                  />
                </Field>
              )}
              {basisNeedsFixed(values.basis) && (
                <Field>
                  <FieldLabel>Montant fixe (FCFA) *</FieldLabel>
                  <AmountInput value={values.feeAmount} onValueChange={(value) => setValues((current) => ({ ...current, feeAmount: value }))} placeholder="0" />
                </Field>
              )}
            </div>
          </FieldGroup>
          {error && (
            <Alert variant="destructive">
              <AlertTitle>Impossible d’enregistrer</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Annuler
            </Button>
            <Button type="submit" disabled={loading}>
              {loading && <Spinner data-icon="inline-start" />}
              {isEdit ? "Enregistrer" : "Créer le mandat"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
