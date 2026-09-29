"use client";

import { createColumnHelper } from "@tanstack/react-table";
import { RoleSelect } from "@/components/dashboard/role-select";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { DataTableColumnHeader } from "@/components/ui/data-table-column-header";
import type { DataTableFeatures } from "@/components/ui/data-table-features";
import type { ApiUser } from "@/lib/dashboard-types";
import { initials } from "@/lib/dashboard-utils";

const columnHelper = createColumnHelper<DataTableFeatures, ApiUser>();

export const teamColumns = columnHelper.columns([
  columnHelper.accessor((row) => row.name, {
    id: "name",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Membre" />,
    sortFn: "text",
    cell: ({ row }) => (
      <div className="flex items-center gap-2">
        <span className="flex size-8 items-center justify-center rounded-full bg-secondary text-[10px] font-bold">{initials(row.original.name)}</span>
        <span className="text-sm font-semibold">{row.original.name}</span>
      </div>
    ),
  }),
  columnHelper.accessor((row) => row.email, {
    id: "email",
    header: () => <span>Email</span>,
    cell: ({ row }) => <span className="text-xs text-muted-foreground">{row.original.email}</span>,
  }),
  columnHelper.accessor((row) => row.role, {
    id: "role",
    header: () => <span>Rôle</span>,
    cell: ({ row }) => <StatusBadge status={row.original.role} />,
  }),
  columnHelper.display({
    id: "edit",
    header: () => <span className="block text-right">Modifier</span>,
    cell: ({ row }) => (
      <div className="flex justify-end">
        <RoleSelect user={row.original} />
      </div>
    ),
  }),
]);