"use client";

import { CreateDialog, type DialogField, type SelectOption } from "@/components/dashboard/create-dialog";

const typeLabels: Record<string, string> = {
  water: "Eau",
  electricity: "Électricité",
  security: "Sécurité",
  other: "Autre",
};

export function CreateUtilityDialog({ buildings }: { buildings: SelectOption[] }) {
  const fields: DialogField[] = [
    { type: "select", name: "buildingId", label: "Immeuble", required: true, placeholder: "Choisir un immeuble", options: buildings },
    {
      type: "select",
      name: "type",
      label: "Type de charge",
      required: true,
      options: Object.entries(typeLabels).map(([value, label]) => ({ value, label })),
    },
    { type: "text", name: "supplier", label: "Fournisseur", placeholder: "SDE, SENELEC…" },
    { type: "amount", name: "totalAmount", label: "Montant total (FCFA)", min: 1, required: true },
    { type: "text", name: "period", label: "Période", placeholder: "Septembre 2026", required: true },
    { type: "upload", name: "invoiceUrl", label: "Facture (PDF)", accept: "application/pdf,image/*", hint: "Facture fournisseur, 10 Mo maximum." },
  ];

  return (
    <CreateDialog
      triggerLabel="Nouvelle facture"
      title="Saisir une facture commune"
      description="La charge est répartie entre toutes les unités de l’immeuble."
      fields={fields}
      endpoint={(payload) => `/api/buildings/${String(payload.buildingId)}/utilities`}
      successMessage="Facture enregistrée et répartie."
      transform={({ buildingId, ...rest }) => rest}
    />
  );
}