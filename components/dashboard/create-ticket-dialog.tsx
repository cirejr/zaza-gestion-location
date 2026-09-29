"use client";

import { CreateDialog, type DialogField, type SelectOption } from "@/components/dashboard/create-dialog";

export function CreateTicketDialog({ buildings }: { buildings: SelectOption[] }) {
  const fields: DialogField[] = [
    { type: "select", name: "buildingId", label: "Immeuble", required: true, placeholder: "Choisir un immeuble", options: buildings },
    { type: "text", name: "title", label: "Titre de l’incident", placeholder: "Fuite d’eau dans les sanitaires", required: true },
    { type: "text", name: "description", label: "Description", placeholder: "Décrivez le problème constaté…", required: true },
    {
      type: "select",
      name: "priority",
      label: "Priorité",
      required: true,
      options: [
        { value: "low", label: "Basse" },
        { value: "normal", label: "Normale" },
        { value: "urgent", label: "Urgente" },
      ],
    },
    { type: "amount", name: "cost", label: "Coût estimé (FCFA)", min: 0 },
    { type: "upload", name: "photoUrl", label: "Photo du problème", accept: "image/*", hint: "PNG, JPG ou WebP, 10 Mo maximum." },
  ];

  return (
    <CreateDialog
      triggerLabel="Signaler un incident"
      title="Nouveau ticket"
      description="Déclarez un incident ou un besoin de travaux dans un immeuble."
      fields={fields}
      endpoint="/api/tickets"
      successMessage="Incident signalé."
      transform={(payload) => ({
        ...payload,
        description: String(payload.description || ""),
      })}
    />
  );
}