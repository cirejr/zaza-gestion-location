"use client";

import { Download } from "lucide-react";
import { createColumnHelper } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { CreatePaymentLinkButton } from "@/components/dashboard/create-payment-link-button";
import { EditPaymentDialog } from "@/components/dashboard/edit-dialogs";
import { RowAction } from "@/components/dashboard/row-action";
import { DataTableColumnHeader } from "@/components/ui/data-table-column-header";
import type { DataTableFeatures } from "@/components/ui/data-table-features";
import type { PaymentRow } from "@/lib/dashboard-types";
import { formatCfa, formatDate, initials } from "@/lib/dashboard-utils";

const columnHelper = createColumnHelper<DataTableFeatures, PaymentRow>();

export const paymentColumns = columnHelper.columns([
  columnHelper.accessor((row) => row.tenant.fullName, {
    id: "tenant",
    header: () => <span>Locataire</span>,
    cell: ({ row }) => (
      <div className="flex items-center gap-2">
        <span className="flex size-8 items-center justify-center rounded-full bg-secondary text-[10px] font-bold">{initials(row.original.tenant.fullName)}</span>
        <span className="text-sm font-semibold">{row.original.tenant.fullName}</span>
      </div>
    ),
  }),
  columnHelper.accessor((row) => `${row.building.name} · ${row.apartment.unitNumber}`, {
    id: "unit",
    header: () => <span>Unité</span>,
    cell: ({ row }) => (
      <span className="text-xs text-muted-foreground">{row.original.building.name} · {row.original.apartment.unitNumber}</span>
    ),
  }),
  columnHelper.accessor((row) => row.payment.paidAt ?? row.payment.createdAt, {
    id: "date",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Date" />,
    sortFn: "text",
    cell: ({ row }) => <span className="text-xs text-muted-foreground">{formatDate(row.original.payment.paidAt ?? row.original.payment.createdAt)}</span>,
  }),
  columnHelper.accessor((row) => Number(row.payment.amount), {
    id: "amount",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Montant" />,
    sortFn: "alphanumeric",
    cell: ({ row }) => <span className="text-sm font-bold">{formatCfa(row.original.payment.amount)}</span>,
  }),
  columnHelper.accessor((row) => row.payment.status, {
    id: "status",
    header: () => <span>Statut</span>,
    cell: ({ row }) => <StatusBadge status={row.original.payment.status} />,
  }),
  columnHelper.display({
    id: "actions",
    header: () => <span className="block text-right">Actions</span>,
    cell: ({ row }) => (
      <div className="flex items-center justify-end gap-1">
        {row.original.payment.status !== "paid" && <CreatePaymentLinkButton paymentId={row.original.payment.id} />}
        {row.original.payment.status === "pending" && (row.original.tenant.whatsappNumber ?? row.original.tenant.phone) && (
          <RowAction
            endpoint="/api/notifications/rent-reminder"
            body={{
              channel: "whatsapp",
              phone: row.original.tenant.whatsappNumber ?? row.original.tenant.phone ?? "",
              tenantName: row.original.tenant.fullName,
              buildingName: row.original.building.name,
              unitNumber: row.original.apartment.unitNumber,
              amount: Number(row.original.payment.amount),
              dueDate: formatDate(row.original.payment.createdAt),
            }}
            label="Relancer"
            size="sm"
            variant="outline"
            successMessage="Relance envoyée."
          />
        )}
        <Button render={<a href={`/api/payments/${row.original.payment.id}/receipt.pdf`} target="_blank" rel="noreferrer" />} variant="ghost" size="icon-sm" aria-label="Télécharger le reçu">
          <Download />
        </Button>
        <EditPaymentDialog payment={row.original.payment} />
        {row.original.payment.status === "pending" && (
          <RowAction
            endpoint={`/api/payments/${row.original.payment.id}`}
            method="DELETE"
            label="Supprimer le paiement"
            icon="trash"
            confirm
            confirmTitle="Supprimer cet encaissement en attente ?"
            successMessage="Paiement supprimé."
          />
        )}
      </div>
    ),
  }),
]);