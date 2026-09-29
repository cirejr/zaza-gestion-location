"use client";

import { CreateDialog, type DialogField, type SelectOption } from "@/components/dashboard/create-dialog";

export function CreateLeaseDialog({ apartments, tenants }: { apartments: SelectOption[]; tenants: SelectOption[] }) {
  const fields: DialogField[] = [
    { type: "select", name: "apartmentId", label: "Unité", required: true, placeholder: "Choisir une unité", options: apartments },
    { type: "select", name: "tenantId", label: "Locataire", required: true, placeholder: "Choisir un locataire", options: tenants },
    { type: "date", name: "startDate", label: "Début du bail", required: true },
    { type: "date", name: "endDate", label: "Fin du bail" },
    { type: "amount", name: "rentAmount", label: "Loyer mensuel (FCFA)", min: 0, required: true },
    { type: "amount", name: "depositAmount", label: "Caution (FCFA)", min: 0 },
    {
      type: "select",
      name: "status",
      label: "Statut",
      required: true,
      options: [
        { value: "active", label: "Actif" },
        { value: "draft", label: "Brouillon" },
      ],
    },
  ];

  return (
    <CreateDialog
      triggerLabel="Nouveau bail"
      title="Créer un bail"
      description="Assignez une unité à un locataire et fixez le loyer."
      fields={fields}
      endpoint="/api/leases"
      successMessage="Bail créé."
      transform={(payload) => ({
        ...payload,
        endDate: payload.endDate ? String(payload.endDate) : null,
      })}
    />
  );
}