"use client";

import { CreateDialog } from "@/components/dashboard/create-dialog";

/**
 * Portal forms for the interactive tenant features: report a repair/degradation
 * and file a claim. Both reuse the generic `CreateDialog` (validated fields,
 * presigned upload, in-place POST + router refresh) and always stamp the
 * tenant's own apartment id server-side on the portal routes, which re-verifies
 * ownership against the lease.
 */

const mediaField = {
  type: "upload" as const,
  name: "photoUrl",
  label: "Photo ou vidéo",
  accept: "image/*,video/*",
  hint: "Image (JPG, PNG, WebP) ou vidéo (MP4, WebM), 10 Mo maximum.",
};

export function TenantReportIssue({ apartmentId }: { apartmentId: string }) {
  return (
    <CreateDialog
      triggerLabel="Signaler un incident ou dégradation"
      title="Nouvelle demande"
      description="Déclarez une réparation à prévoir ou une dégradation constatée dans votre logement."
      fields={[
        {
          type: "select",
          name: "category",
          label: "Type de demande",
          required: true,
          placeholder: "Choisir un type",
          options: [
            { value: "reparation", label: "Réparation à faire" },
            { value: "degradation", label: "Dégradation constatée" },
            { value: "autre", label: "Autre" },
          ],
        },
        { type: "text", name: "title", label: "Titre de la demande", placeholder: "Fuite d’eau dans la salle de bain", required: true },
        { type: "text", name: "description", label: "Description", placeholder: "Décrivez le problème en détail…", required: true },
        {
          type: "select",
          name: "priority",
          label: "Priorité",
          required: true,
          placeholder: "Choisir une priorité",
          options: [
            { value: "low", label: "Basse" },
            { value: "normal", label: "Normale" },
            { value: "urgent", label: "Urgente" },
          ],
        },
        { type: "amount", name: "cost", label: "Coût estimé (FCFA)", min: 0 },
        mediaField,
      ]}
      endpoint="/api/portal/tickets"
      successMessage="Demande transmise à votre gestionnaire."
      transform={(payload) => ({ ...payload, apartmentId })}
    />
  );
}

export function TenantClaimForm({ apartmentId }: { apartmentId: string }) {
  return (
    <CreateDialog
      triggerLabel="Soumettre une réclamation"
      title="Nouvelle réclamation"
      description="Déposez une réclamation formelle (dépôt de garantie, réparation à votre charge, autre)."
      fields={[
        {
          type: "select",
          name: "type",
          label: "Type de réclamation",
          required: true,
          placeholder: "Choisir un type",
          options: [
            { value: "deposit", label: "Dépôt de garantie" },
            { value: "reparation", label: "Réparation" },
            { value: "autre", label: "Autre" },
          ],
        },
        { type: "text", name: "title", label: "Objet de la réclamation", placeholder: "Remboursement du dépôt de garantie", required: true },
        { type: "text", name: "description", label: "Description", placeholder: "Expliquez votre réclamation et les faits…", required: true },
        { type: "amount", name: "amount", label: "Montant réclamé (FCFA)", min: 0 },
        mediaField,
      ]}
      endpoint="/api/portal/claims"
      successMessage="Réclamation transmise à votre gestionnaire."
      transform={(payload) => ({ ...payload, apartmentId })}
    />
  );
}