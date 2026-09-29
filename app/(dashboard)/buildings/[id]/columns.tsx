"use client";

import { createColumnHelper } from "@tanstack/react-table";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { DataTableColumnHeader } from "@/components/ui/data-table-column-header";
import type { DataTableFeatures } from "@/components/ui/data-table-features";
import type { ApiApartment } from "@/lib/dashboard-types";
import { formatCfa } from "@/lib/dashboard-utils";

const columnHelper = createColumnHelper<DataTableFeatures, ApiApartment>();

export const apartmentColumns = columnHelper.columns([
  columnHelper.accessor((row) => row.unitNumber, {
    id: "unitNumber",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Unité" />,
    sortFn: "text",
    cell: ({ row }) => <span className="text-sm font-semibold">{row.original.unitNumber}</span>,
  }),
  columnHelper.accessor((row) => row.floor, {
    id: "floor",
    header: () => <span>Étage</span>,
    cell: ({ row }) => <span className="text-xs text-muted-foreground">{row.original.floor != null ? `${row.original.floor}` : "—"}</span>,
  }),
  columnHelper.accessor((row) => row.bedrooms, {
    id: "bedrooms",
    header: () => <span>Pièces</span>,
    cell: ({ row }) => <span className="text-xs text-muted-foreground">{row.original.bedrooms}</span>,
  }),
  columnHelper.accessor((row) => row.areaSqm, {
    id: "area",
    header: () => <span>Surface</span>,
    cell: ({ row }) => <span className="text-xs text-muted-foreground">{row.original.areaSqm ? `${row.original.areaSqm} m²` : "—"}</span>,
  }),
  columnHelper.accessor((row) => Number(row.rentAmount), {
    id: "rent",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Loyer" />,
    sortFn: "alphanumeric",
    cell: ({ row }) => <span className="text-sm font-bold">{formatCfa(row.original.rentAmount)}</span>,
  }),
  columnHelper.accessor((row) => row.status, {
    id: "status",
    header: () => <span>Statut</span>,
    cell: ({ row }) => <StatusBadge status={row.original.status} />,
  }),
]);