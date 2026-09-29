"use client";

import { CreateDialog, type DialogField, type SelectOption } from "@/components/dashboard/create-dialog";

const methodLabels: Record<string, string> = {
  cash: "Espèces",
  wave: "Wave",
  orange_money: "Orange Money",
  mtn_momo: "MTN MoMo",
  bank_transfer: "Virement",
};

export function CreatePaymentDialog({ leases }: { leases: SelectOption[] }) {
  const fields: DialogField[] = [
    { type: "select", name: "leaseId", label: "Bail", required: true, placeholder: "Choisir un bail", options: leases },
    { type: "amount", name: "amount", label: "Montant (FCFA)", min: 1, required: true },
    {
      type: "select",
      name: "paymentMethod",
      label: "Moyen de paiement",
      required: true,
      options: Object.entries(methodLabels).map(([value, label]) => ({ value, label })),
    },
    {
      type: "select",
      name: "status",
      label: "Statut",
      required: true,
      options: [
        { value: "paid", label: "Payé" },
        { value: "pending", label: "En attente" },
        { value: "failed", label: "Échoué" },
      ],
    },
    { type: "date", name: "paidAt", label: "Date du paiement" },
    { type: "text", name: "transactionRef", label: "Référence / transaction" },
  ];

  return (
    <CreateDialog
      triggerLabel="Enregistrer un paiement"
      title="Nouveau paiement"
      description="Enregistrez un encaissement rattaché à un bail actif."
      fields={fields}
      endpoint="/api/payments"
      successMessage="Paiement enregistré."
      transform={(payload) => ({
        ...payload,
        paidAt: payload.paidAt ? String(payload.paidAt) : null,
        transactionRef: payload.transactionRef ? String(payload.transactionRef) : null,
      })}
    />
  );
}