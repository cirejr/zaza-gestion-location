"use client";

import { Pencil } from "lucide-react";
import { CreateDialog, type DialogField } from "@/components/dashboard/create-dialog";
import { Button } from "@/components/ui/button";
import { formatAmountInput } from "@/lib/amount";
import type { ApiApartment, ApiBuilding, ApiLease, ApiPayment, ApiTenant, ApiTicket, ApiUtility } from "@/lib/dashboard-types";

/**
 * Row-level edit dialogs. They reuse the create form (`CreateDialog`) with
 * `method="PATCH"` so field rendering, amount formatting and validation stay in
 * one place. Foreign keys (lease, tenant, building, apartment) are intentionally
 * omitted: changing them is a re-assignment, not an edit, and would need the
 * full option list on every row.
 */

function EditTrigger({ label }: { label: string }) {
  return (
    <Button variant="ghost" size="icon-sm" aria-label={label} title={label}>
      <Pencil />
    </Button>
  );
}

/** Amounts are stored as strings; show them grouped like the create form. */
function amountValue(value: string | number | null | undefined) {
  if (value == null) return "";
  return formatAmountInput(String(value));
}

function dateValue(value: string | null | undefined) {
  return value ? value.slice(0, 10) : "";
}

const tenantFields: DialogField[] = [
  { type: "text", name: "fullName", label: "Nom complet", placeholder: "Awa Diallo", required: true },
  { type: "text", name: "phone", label: "Téléphone", placeholder: "+221 77 000 00 00", required: true },
  { type: "text", name: "whatsappNumber", label: "WhatsApp", placeholder: "Même numéro que le téléphone si identique" },
  { type: "upload", name: "identityDocUrl", label: "Pièce d’identité", accept: "image/*,application/pdf", hint: "CNI ou passeport, 10 Mo maximum." },
];

export function EditTenantDialog({ tenant }: { tenant: ApiTenant }) {
  return (
    <CreateDialog
      method="PATCH"
      trigger={<EditTrigger label={`Modifier ${tenant.fullName}`} />}
      title="Modifier le locataire"
      description="Mettez à jour les coordonnées utilisées pour les relances et les notes."
      fields={tenantFields}
      endpoint={`/api/tenants/${tenant.id}`}
      successMessage="Locataire mis à jour."
      defaults={{
        fullName: tenant.fullName,
        phone: tenant.phone,
        whatsappNumber: tenant.whatsappNumber ?? "",
        identityDocUrl: tenant.identityDocUrl ?? "",
      }}
    />
  );
}

const buildingFields: DialogField[] = [
  { type: "text", name: "name", label: "Nom de l’immeuble", placeholder: "Résidence Les Flamboyants", required: true },
  { type: "text", name: "address", label: "Adresse", placeholder: "Route de Ouakam, n° 14", required: true },
  { type: "text", name: "city", label: "Ville", placeholder: "Dakar" },
  { type: "text", name: "country", label: "Pays", placeholder: "Sénégal" },
];

export function EditBuildingDialog({ building }: { building: ApiBuilding }) {
  return (
    <CreateDialog
      method="PATCH"
      trigger={<EditTrigger label={`Modifier ${building.name}`} />}
      title="Modifier l’immeuble"
      description="Corrigez le nom ou l’adresse de l’immeuble."
      fields={buildingFields}
      endpoint={`/api/buildings/${building.id}`}
      successMessage="Immeuble mis à jour."
      defaults={{
        name: building.name,
        address: building.address,
        city: building.city ?? "",
        country: building.country ?? "",
      }}
    />
  );
}

const apartmentFields: DialogField[] = [
  { type: "text", name: "unitNumber", label: "Numéro d’unité", placeholder: "A1", required: true },
  { type: "number", name: "floor", label: "Étage", min: -5 },
  { type: "number", name: "bedrooms", label: "Pièces", min: 0 },
  { type: "number", name: "areaSqm", label: "Surface (m²)", min: 1 },
  { type: "amount", name: "rentAmount", label: "Loyer mensuel (FCFA)", min: 0, required: true },
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

export function EditApartmentDialog({ apartment }: { apartment: ApiApartment }) {
  return (
    <CreateDialog
      method="PATCH"
      trigger={<EditTrigger label={`Modifier l’unité ${apartment.unitNumber}`} />}
      title="Modifier l’unité"
      description="Ajustez le loyer, la surface ou le statut de l’unité."
      fields={apartmentFields}
      endpoint={`/api/apartments/${apartment.id}`}
      successMessage="Unité mise à jour."
      defaults={{
        unitNumber: apartment.unitNumber,
        floor: apartment.floor == null ? "" : String(apartment.floor),
        bedrooms: String(apartment.bedrooms),
        areaSqm: apartment.areaSqm == null ? "" : String(apartment.areaSqm),
        rentAmount: amountValue(apartment.rentAmount),
        status: apartment.status,
      }}
    />
  );
}

const methodOptions = [
  { value: "cash", label: "Espèces" },
  { value: "wave", label: "Wave" },
  { value: "orange_money", label: "Orange Money" },
  { value: "mtn_momo", label: "MTN MoMo" },
  { value: "bank_transfer", label: "Virement" },
];

const paymentFields: DialogField[] = [
  { type: "amount", name: "amount", label: "Montant (FCFA)", min: 1, required: true },
  { type: "select", name: "paymentMethod", label: "Moyen de paiement", required: true, options: methodOptions },
  {
    type: "select",
    name: "status",
    label: "Statut",
    required: true,
    options: [
      { value: "paid", label: "Payé" },
      { value: "pending", label: "En attente" },
      { value: "failed", label: "Échoué" },
      { value: "refunded", label: "Remboursé" },
    ],
  },
  { type: "date", name: "paidAt", label: "Date du paiement" },
  { type: "text", name: "transactionRef", label: "Référence / transaction" },
  { type: "text", name: "notes", label: "Notes" },
];

export function EditPaymentDialog({ payment }: { payment: ApiPayment }) {
  return (
    <CreateDialog
      method="PATCH"
      trigger={<EditTrigger label="Modifier le paiement" />}
      title="Modifier le paiement"
      description="Corrigez le montant, le moyen ou le statut de l’encaissement."
      fields={paymentFields}
      endpoint={`/api/payments/${payment.id}`}
      successMessage="Paiement mis à jour."
      defaults={{
        amount: amountValue(payment.amount),
        paymentMethod: payment.paymentMethod,
        status: payment.status,
        paidAt: dateValue(payment.paidAt),
        transactionRef: payment.transactionRef ?? "",
        notes: "",
      }}
    />
  );
}

const ticketFields: DialogField[] = [
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
];

export function EditTicketDialog({ ticket }: { ticket: ApiTicket }) {
  return (
    <CreateDialog
      method="PATCH"
      trigger={<EditTrigger label={`Modifier « ${ticket.title} »`} />}
      title="Modifier l’incident"
      description="Mettez à jour la description, la priorité ou le coût estimé."
      fields={ticketFields}
      endpoint={`/api/tickets/${ticket.id}`}
      successMessage="Incident mis à jour."
      defaults={{
        title: ticket.title,
        description: ticket.description,
        priority: ticket.priority,
        cost: amountValue(ticket.cost),
      }}
    />
  );
}

const utilityFields: DialogField[] = [
  {
    type: "select",
    name: "type",
    label: "Type de charge",
    required: true,
    options: [
      { value: "water", label: "Eau" },
      { value: "electricity", label: "Électricité" },
      { value: "security", label: "Sécurité" },
      { value: "other", label: "Autre" },
    ],
  },
  { type: "text", name: "supplier", label: "Fournisseur", placeholder: "SDE, SENELEC…" },
  { type: "amount", name: "totalAmount", label: "Montant total (FCFA)", min: 1, required: true },
  { type: "text", name: "period", label: "Période", placeholder: "Septembre 2026", required: true },
];

export function EditUtilityDialog({ utility }: { utility: ApiUtility }) {
  return (
    <CreateDialog
      method="PATCH"
      trigger={<EditTrigger label="Modifier la facture" />}
      title="Modifier la facture"
      description="Modifier le montant relance la répartition entre les unités."
      fields={utilityFields}
      endpoint={`/api/utilities/${utility.id}`}
      successMessage="Facture mise à jour."
      defaults={{
        type: utility.type,
        supplier: utility.supplier ?? "",
        totalAmount: amountValue(utility.totalAmount),
        period: utility.period,
      }}
    />
  );
}

const leaseFields: DialogField[] = [
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
      { value: "expired", label: "Expiré" },
      { value: "terminated", label: "Résilié" },
    ],
  },
];

export function EditLeaseDialog({ lease }: { lease: ApiLease }) {
  return (
    <CreateDialog
      method="PATCH"
      trigger={<EditTrigger label="Modifier le bail" />}
      title="Modifier le bail"
      description="Ajustez la date de fin, le loyer, la caution ou le statut."
      fields={leaseFields}
      endpoint={`/api/leases/${lease.id}`}
      successMessage="Bail mis à jour."
      defaults={{
        endDate: dateValue(lease.endDate),
        rentAmount: amountValue(lease.rentAmount),
        depositAmount: amountValue(lease.depositAmount),
        status: lease.status,
      }}
    />
  );
}
