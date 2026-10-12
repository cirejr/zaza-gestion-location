"use client";

import { ClipboardList } from "lucide-react";
import { createColumnHelper } from "@tanstack/react-table";
import { RowAction } from "@/components/dashboard/row-action";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { DataTableColumnHeader } from "@/components/ui/data-table-column-header";
import type { DataTableFeatures } from "@/components/ui/data-table-features";
import type { ClaimRow } from "@/lib/dashboard-types";
import { formatCfa, formatDate } from "@/lib/dashboard-utils";

const columnHelper = createColumnHelper<DataTableFeatures, ClaimRow>();

const claimTypeLabel = (type: string) => {
  const labels: Record<string, string> = { deposit: "Dépôt de garantie", reparation: "Réparation", autre: "Autre" };
  return labels[type] ?? type;
};

export const claimColumns = columnHelper.columns([
  columnHelper.accessor((row) => row.claim.title, {
    id: "title",
    header: () => <span>Réclamation</span>,
    cell: ({ row }) => (
      <div className="flex items-center gap-2">
        <span className="flex size-8 items-center justify-center rounded-lg bg-secondary text-secondary-foreground"><ClipboardList /></span>
        <div className="min-w-0">
          <span className="block truncate text-sm font-semibold">{row.original.claim.title}</span>
          <span className="block max-w-56 truncate text-xs text-muted-foreground">{row.original.claim.description}</span>
        </div>
      </div>
    ),
  }),
  columnHelper.accessor((row) => row.tenant.fullName, {
    id: "tenant",
    header: () => <span>Locataire</span>,
    cell: ({ row }) => <span className="text-xs">{row.original.tenant.fullName}</span>,
  }),
  columnHelper.accessor((row) => `${row.building.name}${row.apartment ? ` ${row.apartment.unitNumber}` : ""}`, {
    id: "building",
    header: () => <span>Immeuble</span>,
    cell: ({ row }) => (
      <span className="text-xs text-muted-foreground">{row.original.building.name}{row.original.apartment ? ` · ${row.original.apartment.unitNumber}` : ""}</span>
    ),
  }),
  columnHelper.accessor((row) => claimTypeLabel(row.claim.type), {
    id: "type",
    header: () => <span>Type</span>,
    cell: ({ row }) => <span className="text-xs">{claimTypeLabel(row.original.claim.type)}</span>,
  }),
  columnHelper.accessor((row) => (row.claim.amount == null ? 0 : Number(row.claim.amount)), {
    id: "amount",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Montant" />,
    sortFn: "alphanumeric",
    cell: ({ row }) => (row.original.claim.amount == null ? <span className="text-xs text-muted-foreground">—</span> : <span className="text-sm font-semibold">{formatCfa(row.original.claim.amount)}</span>),
  }),
  columnHelper.accessor((row) => row.claim.createdAt, {
    id: "createdAt",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Date" />,
    sortFn: "text",
    cell: ({ row }) => <span className="text-xs text-muted-foreground">{formatDate(row.original.claim.createdAt)}</span>,
  }),
  columnHelper.accessor((row) => row.claim.status, {
    id: "status",
    header: () => <span>Statut</span>,
    cell: ({ row }) => <StatusBadge status={row.original.claim.status} />,
  }),
  columnHelper.display({
    id: "actions",
    header: () => <span className="block text-right">Actions</span>,
    cell: ({ row }) => (
      <div className="flex items-center justify-end gap-1">
        {row.original.claim.status === "pending" && (
          <>
            <RowAction
              endpoint={`/api/claims/${row.original.claim.id}`}
              method="PATCH"
              body={{ status: "approved" }}
              label="Approuver"
              successMessage="Réclamation approuvée."
              variant="outline"
              size="sm"
            />
            <RowAction
              endpoint={`/api/claims/${row.original.claim.id}`}
              method="PATCH"
              body={{ status: "rejected" }}
              label="Rejeter"
              successMessage="Réclamation rejetée."
              variant="outline"
              size="sm"
              confirm
              confirmTitle="Rejeter cette réclamation ?"
            />
          </>
        )}
        <RowAction
          endpoint={`/api/claims/${row.original.claim.id}`}
          method="DELETE"
          label="Supprimer la réclamation"
          icon="trash"
          confirm
          confirmTitle="Supprimer définitivement cette réclamation ?"
          successMessage="Réclamation supprimée."
        />
      </div>
    ),
  }),
]);