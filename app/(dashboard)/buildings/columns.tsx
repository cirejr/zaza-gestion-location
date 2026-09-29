"use client";

import { createColumnHelper } from "@tanstack/react-table";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { DataTableColumnHeader } from "@/components/ui/data-table-column-header";
import type { DataTableFeatures } from "@/components/ui/data-table-features";
import type { ApiApartment, ApiBuilding } from "@/lib/dashboard-types";
import { formatCfa } from "@/lib/dashboard-utils";

/** Row shape for the units table: an apartment with its building name. */
export type UnitOverviewRow = { apartment: ApiApartment; building: ApiBuilding };

const columnHelper = createColumnHelper<DataTableFeatures, UnitOverviewRow>();

export const unitOverviewColumns = columnHelper.columns([
  columnHelper.accessor((row) => row.apartment.unitNumber, {
    id: "unitNumber",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Unité" />,
    sortFn: "text",
    cell: ({ row }) => <span className="text-sm font-semibold">{row.original.apartment.unitNumber}</span>,
  }),
  columnHelper.accessor((row) => row.building.name, {
    id: "building",
    header: () => <span>Immeuble</span>,
    cell: ({ row }) => <span className="text-xs text-muted-foreground">{row.original.building.name}</span>,
  }),
  columnHelper.accessor((row) => Number(row.apartment.rentAmount), {
    id: "rent",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Loyer mensuel" />,
    sortFn: "alphanumeric",
    cell: ({ row }) => <span className="text-xs font-semibold">{formatCfa(row.original.apartment.rentAmount)}</span>,
  }),
  columnHelper.accessor((row) => row.apartment.status, {
    id: "status",
    header: () => <span>Statut</span>,
    cell: ({ row }) => <StatusBadge status={row.original.apartment.status} />,
  }),
]);