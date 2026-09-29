"use client";

import { Wrench } from "lucide-react";
import { createColumnHelper } from "@tanstack/react-table";
import { EditTicketDialog } from "@/components/dashboard/edit-dialogs";
import { RowAction } from "@/components/dashboard/row-action";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { DataTableColumnHeader } from "@/components/ui/data-table-column-header";
import type { DataTableFeatures } from "@/components/ui/data-table-features";
import type { TicketRow } from "@/lib/dashboard-types";
import { formatDate } from "@/lib/dashboard-utils";

const columnHelper = createColumnHelper<DataTableFeatures, TicketRow>();

export const ticketColumns = columnHelper.columns([
  columnHelper.accessor((row) => row.ticket.title, {
    id: "title",
    header: () => <span>Incident</span>,
    cell: ({ row }) => (
      <div className="flex items-center gap-2">
        <span className="flex size-8 items-center justify-center rounded-lg bg-secondary text-secondary-foreground"><Wrench /></span>
        <div className="min-w-0">
          <span className="block truncate text-sm font-semibold">{row.original.ticket.title}</span>
          <span className="block max-w-56 truncate text-xs text-muted-foreground">{row.original.ticket.description}</span>
        </div>
      </div>
    ),
  }),
  columnHelper.accessor((row) => `${row.building.name}${row.apartment ? ` ${row.apartment.unitNumber}` : ""}`, {
    id: "building",
    header: () => <span>Immeuble</span>,
    cell: ({ row }) => (
      <span className="text-xs text-muted-foreground">{row.original.building.name}{row.original.apartment ? ` · ${row.original.apartment.unitNumber}` : ""}</span>
    ),
  }),
  columnHelper.accessor((row) => row.ticket.priority, {
    id: "priority",
    header: () => <span>Priorité</span>,
    cell: ({ row }) => <StatusBadge status={row.original.ticket.priority} />,
  }),
  columnHelper.accessor((row) => row.ticket.createdAt, {
    id: "createdAt",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Date" />,
    sortFn: "text",
    cell: ({ row }) => <span className="text-xs text-muted-foreground">{formatDate(row.original.ticket.createdAt)}</span>,
  }),
  columnHelper.accessor((row) => row.ticket.status, {
    id: "status",
    header: () => <span>Statut</span>,
    cell: ({ row }) => <StatusBadge status={row.original.ticket.status} />,
  }),
  columnHelper.display({
    id: "actions",
    header: () => <span className="block text-right">Actions</span>,
    cell: ({ row }) => (
      <div className="flex items-center justify-end gap-1">
        {row.original.ticket.status !== "resolved" && (
          <RowAction
            endpoint={`/api/tickets/${row.original.ticket.id}/resolve`}
            label="Marquer comme résolu"
            variant="outline"
            size="sm"
            confirm
            confirmTitle="Marquer ce ticket comme résolu ?"
            successMessage="Ticket résolu."
          />
        )}
        <EditTicketDialog ticket={row.original.ticket} />
        <RowAction
          endpoint={`/api/tickets/${row.original.ticket.id}`}
          method="DELETE"
          label="Supprimer l’incident"
          icon="trash"
          confirm
          confirmTitle="Supprimer définitivement cet incident ?"
          successMessage="Incident supprimé."
        />
      </div>
    ),
  }),
]);