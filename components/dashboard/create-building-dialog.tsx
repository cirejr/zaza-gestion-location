"use client";

import { CreateDialog, type DialogField } from "@/components/dashboard/create-dialog";

const buildingFields: DialogField[] = [
  { type: "text", name: "name", label: "Nom de l’immeuble", placeholder: "Résidence Les Flamboyants", required: true },
  { type: "text", name: "address", label: "Adresse", placeholder: "Route de Ouakam, n° 14", required: true },
  { type: "text", name: "city", label: "Ville", placeholder: "Dakar" },
  { type: "text", name: "country", label: "Pays", placeholder: "Sénégal" },
  { type: "upload", name: "photoUrls", label: "Photo de l’immeuble", accept: "image/*", hint: "PNG, JPG ou WebP, 10 Mo maximum." },
];

export function CreateBuildingDialog() {
  return (
    <CreateDialog
      triggerLabel="Ajouter un immeuble"
      title="Nouvel immeuble"
      description="Ajoutez un immeuble pour y rattacher vos unités."
      fields={buildingFields}
      endpoint="/api/buildings"
      successMessage="Immeuble créé."
      transform={(payload) => ({ ...payload, photoUrls: payload.photoUrls ? [payload.photoUrls] : [] })}
    />
  );
}