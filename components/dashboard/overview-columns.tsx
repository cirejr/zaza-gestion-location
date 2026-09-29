"use client";

import { createColumnHelper } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { DataTableColumnHeader } from "@/components/ui/data-table-column-header";
import type { DataTableFeatures } from "@/components/ui/data-table-features";
import type { PaymentRow } from "@/lib/dashboard-types";
import { formatCfa, formatDate, initials } from "@/lib/dashboard-utils";

const columnHelper = createColumnHelper<DataTableFeatures, PaymentRow>();

const paymentStatusLabel = (row: PaymentRow) =>
  row.payment.status === "paid" ? "Payé" : row.payment.status === "pending" ? "En attente" : "En retard";

export const recentPaymentColumns = columnHelper.columns([
  columnHelper.accessor((row) => row.tenant.fullName, {
    id: "tenant",
    header: () => <span>Locataire</span>,
    cell: ({ row }) => (
      <div className="flex items-center gap-2">
        <span className="flex size-8 items-center justify-center rounded-full bg-secondary text-[10px] font-bold">{initials(row.original.tenant.fullName)}</span>
        <span className="text-xs font-semibold">{row.original.tenant.fullName}</span>
      </div>
    ),
  }),
  columnHelper.accessor((row) => row.apartment.unitNumber, {
    id: "unit",
    header: () => <span>Unité</span>,
    cell: ({ row }) => <span className="text-xs text-muted-foreground">{row.original.apartment.unitNumber}</span>,
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
    cell: ({ row }) => <span className="text-xs font-bold">{formatCfa(row.original.payment.amount)}</span>,
  }),
  columnHelper.accessor((row) => row.payment.status, {
    id: "status",
    header: () => <span>Statut</span>,
    cell: ({ row }) => (
      <Badge variant={row.original.payment.status === "paid" ? "secondary" : "outline"}>{paymentStatusLabel(row.original)}</Badge>
    ),
  }),
]);