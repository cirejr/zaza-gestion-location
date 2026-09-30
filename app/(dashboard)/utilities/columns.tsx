"use client";

import { Droplets } from "lucide-react";
import { createColumnHelper } from "@tanstack/react-table";
import { EditUtilityDialog } from "@/components/dashboard/edit-dialogs";
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
      <div className="flex items-center justify-end gap-1">
        <RowAction
          endpoint={`/api/utilities/${row.original.utility.id}/notify`}
          label="Notifier les locataires"
          icon="send"
          confirm
          confirmTitle="Envoyer la note de charges à tous les locataires actifs ?"
          // This fans out to every occupant, so the counts are the point: a fixed
          // string here claimed success even when nothing was delivered, and the
          // channel can differ per occupant when the ladder falls back mid-list.
          successMessage={(data) => {
            const body = data as
              | { data?: { delivered?: number; total?: number; notifications?: Array<{ delivered: boolean; channel?: string }> } }
              | null;
            const delivered = body?.data?.delivered ?? 0;
            const total = body?.data?.total ?? 0;
            if (total === 0) return "Aucun locataire actif dans cette facture.";
            const noun = total > 1 ? "locataires" : "locataire";
            if (delivered === 0) return `Aucune note envoyée sur ${total} ${noun}.`;
            if (delivered < total) return `${delivered} note(s) sur ${total} envoyée(s) — les autres sont à réessayer.`;
            const via = body?.data?.notifications?.[0]?.channel === "whatsapp" ? "WhatsApp" : "SMS";
            return `Notes envoyées à ${delivered} ${noun} par ${via}.`;
          }}
          disabled={row.original.utility.splitStatus === "notified"}
        />
        <EditUtilityDialog utility={row.original.utility} />
        <RowAction
          endpoint={`/api/utilities/${row.original.utility.id}`}
          method="DELETE"
          label="Supprimer la facture"
          icon="trash"
          confirm
          confirmTitle="Supprimer cette facture et sa répartition ?"
          successMessage="Facture supprimée."
        />
      </div>
    ),
  }),
]);