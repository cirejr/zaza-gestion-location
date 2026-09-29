"use client";

import { Download, FileText } from "lucide-react";
import { createColumnHelper } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { EditLeaseDialog } from "@/components/dashboard/edit-dialogs";
import { RowAction } from "@/components/dashboard/row-action";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { DataTableColumnHeader } from "@/components/ui/data-table-column-header";
import type { DataTableFeatures } from "@/components/ui/data-table-features";
import type { LeaseRow } from "@/lib/dashboard-types";
import { formatCfa, formatDate } from "@/lib/dashboard-utils";

const columnHelper = createColumnHelper<DataTableFeatures, LeaseRow>();

export const leaseColumns = columnHelper.columns([
  columnHelper.accessor((row) => row.apartment.unitNumber, {
    id: "contract",
    header: () => <span>Contrat</span>,
    cell: ({ row }) => (
      <div className="flex items-center gap-2">
        <span className="flex size-8 items-center justify-center rounded-lg bg-secondary text-secondary-foreground"><FileText /></span>
        <span className="text-xs font-semibold">{row.original.apartment.unitNumber}</span>
      </div>
    ),
  }),
  columnHelper.accessor((row) => row.tenant.fullName, {
    id: "tenant",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Locataire" />,
    sortFn: "text",
    cell: ({ row }) => <span className="text-sm font-medium">{row.original.tenant.fullName}</span>,
  }),
  columnHelper.accessor((row) => `${row.lease.startDate}${row.lease.endDate ?? ""}`, {
    id: "period",
    header: () => <span>Période</span>,
    cell: ({ row }) => (
      <span className="text-xs text-muted-foreground">{formatDate(row.original.lease.startDate)}{row.original.lease.endDate ? ` → ${formatDate(row.original.lease.endDate)}` : ""}</span>
    ),
  }),
  columnHelper.accessor((row) => Number(row.lease.depositAmount), {
    id: "deposit",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Caution" />,
    sortFn: "alphanumeric",
    cell: ({ row }) => <span className="text-xs font-semibold">{formatCfa(row.original.lease.depositAmount)}</span>,
  }),
  columnHelper.accessor((row) => row.lease.status, {
    id: "status",
    header: () => <span>Statut</span>,
    cell: ({ row }) => <StatusBadge status={row.original.lease.status} />,
  }),
  columnHelper.display({
    id: "actions",
    header: () => <span className="block text-right">Actions</span>,
    cell: ({ row }) => (
      <div className="flex items-center justify-end gap-1">
        <Button render={<a href={`/api/leases/${row.original.lease.id}/contract.pdf`} target="_blank" rel="noreferrer" />} variant="ghost" size="icon-sm" aria-label="Télécharger le contrat">
          <Download />
        </Button>
        <EditLeaseDialog lease={row.original.lease} />
        {row.original.lease.status === "active" && (
          <RowAction
            endpoint={`/api/leases/${row.original.lease.id}/terminate`}
            label="Résilier le bail"
            icon="trash"
            confirm
            confirmTitle="Résilier ce bail ? L’unité repassera en statut libre."
            successMessage="Bail résilié."
          />
        )}
      </div>
    ),
  }),
]);