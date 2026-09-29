"use client";

import { Droplets } from "lucide-react";
import { createColumnHelper } from "@tanstack/react-table";
import { RowAction } from "@/components/dashboard/row-action";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { DataTableColumnHeader } from "@/components/ui/data-table-column-header";
import type { DataTableFeatures } from "@/components/ui/data-table-features";
import type { ApiBuilding, ApiUtility } from "@/lib/dashboard-types";
import { formatCfa } from "@/lib/dashboard-utils";

/** Row shape returned by `/api/utilities/overview`: an invoice with its building. */
export type UtilityInvoiceRow = { utility: ApiUtility; building: ApiBuilding };

const columnHelper = createColumnHelper<DataTableFeatures, UtilityInvoiceRow>();

const typeLabels: Record<string, string> = {
  water: "Eau",
  electricity: "Électricité",
  security: "Sécurité",
  other: "Autre",
};

export const utilityColumns = columnHelper.columns([
  columnHelper.accessor((row) => typeLabels[row.utility.type] ?? row.utility.type, {
    id: "type",
    header: () => <span>Charge</span>,
    cell: ({ row }) => (
      <div className="flex items-center gap-2">
        <span className="flex size-8 items-center justify-center rounded-lg bg-secondary text-secondary-foreground"><Droplets /></span>
        <span className="text-sm font-semibold">{typeLabels[row.original.utility.type] ?? row.original.utility.type}</span>
      </div>
    ),
  }),
  columnHelper.accessor((row) => row.building.name, {
    id: "building",
    header: () => <span>Immeuble</span>,
    cell: ({ row }) => <span className="text-xs text-muted-foreground">{row.original.building.name}</span>,
  }),
  columnHelper.accessor((row) => row.utility.period, {
    id: "period",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Période" />,
    sortFn: "text",
    cell: ({ row }) => <span className="text-xs text-muted-foreground">{row.original.utility.period}</span>,
  }),
  columnHelper.accessor((row) => Number(row.utility.totalAmount), {
    id: "amount",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Montant" />,
    sortFn: "alphanumeric",
    cell: ({ row }) => <span className="text-sm font-bold">{formatCfa(row.original.utility.totalAmount)}</span>,
  }),
  columnHelper.accessor((row) => row.utility.splitStatus, {
    id: "splitStatus",
    header: () => <span>Statut</span>,
    cell: ({ row }) => <StatusBadge status={row.original.utility.splitStatus} />,
  }),
  columnHelper.display({
    id: "actions",
    header: () => <span className="block text-right">Action</span>,
    cell: ({ row }) => (
      <div className="flex justify-end">
        <RowAction
          endpoint={`/api/utilities/${row.original.utility.id}/notify`}
          label="Notifier les locataires"
          icon="send"
          confirm
          confirmTitle="Envoyer la note aux locataires par WhatsApp ?"
          successMessage="Notes envoyées."
          disabled={row.original.utility.splitStatus === "notified"}
        />
      </div>
    ),
  }),
]);