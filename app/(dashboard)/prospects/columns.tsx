"use client";

import Link from "next/link";
import { Phone, UserSearch } from "lucide-react";
import { createColumnHelper } from "@tanstack/react-table";
import { RowAction } from "@/components/dashboard/row-action";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { Button } from "@/components/ui/button";
import { DataTableColumnHeader } from "@/components/ui/data-table-column-header";
import type { DataTableFeatures } from "@/components/ui/data-table-features";
import type { ApiProspect } from "@/lib/dashboard-types";
import { formatCfa, formatDate } from "@/lib/dashboard-utils";

const columnHelper = createColumnHelper<DataTableFeatures, ApiProspect>();

export const propertyTypeLabel = (value: string | null | undefined) =>
  ({ studio: "Studio", chambre: "Chambre", apartment: "Appartement", house: "Maison", commercial: "Local commercial", other: "Autre" })[value ?? ""] ?? value ?? "—";

export function budgetLabel(prospect: ApiProspect) {
  if (prospect.budgetMin == null && prospect.budgetMax == null) return "—";
  if (prospect.budgetMin == null) return `≤ ${formatCfa(prospect.budgetMax!)}`;
  if (prospect.budgetMax == null) return `≥ ${formatCfa(prospect.budgetMin)}`;
  return `${formatCfa(prospect.budgetMin)} – ${formatCfa(prospect.budgetMax)}`;
}

export const prospectColumns = columnHelper.columns([
  columnHelper.accessor((row) => row.fullName, {
    id: "fullName",
    header: () => <span>Prospect</span>,
    cell: ({ row }) => (
      <div className="flex items-center gap-2">
        <span className="flex size-8 items-center justify-center rounded-lg bg-secondary text-secondary-foreground"><UserSearch /></span>
        <div className="min-w-0">
          <span className="block truncate text-sm font-semibold">{row.original.fullName}</span>
          <span className="block text-xs text-muted-foreground">{row.original.phone}</span>
        </div>
      </div>
    ),
  }),
  columnHelper.accessor((row) => row.location ?? "", {
    id: "location",
    header: () => <span>Secteur</span>,
    cell: ({ row }) => <span className="text-xs">{row.original.location ?? "—"}</span>,
  }),
  columnHelper.accessor((row) => row.propertyType ?? "", {
    id: "propertyType",
    header: () => <span>Type</span>,
    cell: ({ row }) => <span className="text-xs">{propertyTypeLabel(row.original.propertyType)}</span>,
  }),
  columnHelper.accessor((row) => `${row.budgetMin ?? ""}–${row.budgetMax ?? ""}`, {
    id: "budget",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Budget" />,
    sortFn: "alphanumeric",
    cell: ({ row }) => <span className="text-xs">{budgetLabel(row.original)}</span>,
  }),
  columnHelper.accessor((row) => row.moveInDate ?? "", {
    id: "moveInDate",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Emménagement" />,
    cell: ({ row }) => <span className="text-xs text-muted-foreground">{formatDate(row.original.moveInDate)}</span>,
  }),
  columnHelper.accessor((row) => row.status, {
    id: "status",
    header: () => <span>Statut</span>,
    cell: ({ row }) => <StatusBadge status={row.original.status} />,
  }),
  columnHelper.accessor((row) => row.createdAt, {
    id: "createdAt",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Créé le" />,
    sortFn: "text",
    cell: ({ row }) => <span className="text-xs text-muted-foreground">{formatDate(row.original.createdAt)}</span>,
  }),
  columnHelper.display({
    id: "actions",
    header: () => <span className="block text-right">Actions</span>,
    cell: ({ row }) => (
      <div className="flex items-center justify-end gap-1">
        <Button variant="outline" size="sm" render={<Link href={`/prospects/${row.original.id}`} />}>
          Ouvrir
        </Button>
        {!row.original.convertedTenantId && (
          <RowAction
            endpoint={`/api/prospects/${row.original.id}`}
            method="DELETE"
            label="Supprimer le prospect"
            icon="trash"
            confirm
            confirmTitle="Supprimer définitivement ce prospect ?"
            successMessage="Prospect supprimé."
          />
        )}
      </div>
    ),
  }),
]);

export function CallLink({ phone, children }: { phone: string; children: React.ReactNode }) {
  return (
    <Button variant="outline" size="sm" render={<a href={`tel:${phone.replace(/[^+0-9]/g, "")}`} />}>
      <Phone data-icon="inline-start" />
      {children}
    </Button>
  );
}