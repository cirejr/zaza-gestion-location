"use client";

import { CreateDialog, type DialogField } from "@/components/dashboard/create-dialog";

const apartmentFields: DialogField[] = [
  { type: "text", name: "unitNumber", label: "Numéro d’unité", placeholder: "A1", required: true },
  { type: "number", name: "floor", label: "Étage", min: -5 },
  { type: "number", name: "bedrooms", label: "Pièces", min: 0 },
  { type: "number", name: "areaSqm", label: "Surface (m²)", min: 1 },
  { type: "number", name: "rentAmount", label: "Loyer mensuel (FCFA)", min: 0, required: true },
  {
    type: "select",
    name: "status",
    label: "Statut",
    required: true,
    options: [
      { value: "vacant", label: "Libre" },
      { value: "occupied", label: "Occupé" },
      { value: "maintenance", label: "Travaux" },
    ],
  },
];

export function CreateApartmentDialog({ buildingId, buildingName }: { buildingId: string; buildingName: string }) {
  return (
    <CreateDialog
      triggerLabel="Ajouter une unité"
      title="Nouvelle unité"
      description={`Rattachez une unité à ${buildingName}.`}
      fields={apartmentFields}
      endpoint={`/api/buildings/${buildingId}/apartments`}
      successMessage="Unité créée."
    />
  );
}