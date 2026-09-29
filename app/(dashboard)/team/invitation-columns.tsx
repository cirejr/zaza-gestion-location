"use client";

import { createColumnHelper } from "@tanstack/react-table";
import { RowAction } from "@/components/dashboard/row-action";
import { DataTableColumnHeader } from "@/components/ui/data-table-column-header";
import type { DataTableFeatures } from "@/components/ui/data-table-features";
import type { ApiInvitation } from "@/lib/dashboard-types";

const columnHelper = createColumnHelper<DataTableFeatures, ApiInvitation>();

const roleLabels: Record<ApiInvitation["role"], string> = {
  owner: "Propriétaire",
  manager: "Gérant",
  tenant: "Locataire",
};

export const invitationColumns = columnHelper.columns([
  columnHelper.accessor((row) => row.email, {
    id: "email",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Invité" />,
    sortFn: "text",
    cell: ({ row }) => <span className="text-sm font-medium">{row.original.email}</span>,
  }),
  columnHelper.accessor((row) => row.role, {
    id: "role",
    header: () => <span>Rôle</span>,
    cell: ({ row }) => <span className="text-xs text-muted-foreground">{roleLabels[row.original.role] ?? row.original.role}</span>,
  }),
  columnHelper.accessor((row) => row.expiresAt, {
    id: "expiresAt",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Expire le" />,
    sortFn: "text",
    cell: ({ row }) => <span className="text-xs text-muted-foreground">{new Date(row.original.expiresAt).toLocaleDateString("fr-FR")}</span>,
  }),
  columnHelper.display({
    id: "actions",
    header: () => <span className="block text-right">Action</span>,
    cell: ({ row }) => (
      <div className="flex justify-end">
        <RowAction
          endpoint={`/api/users/invitations/${row.original.id}`}
          method="DELETE"
          label="Révoquer l’invitation"
          icon="trash"
          confirm
          confirmTitle="Révoquer cette invitation ?"
          successMessage="Invitation révoquée."
        />
      </div>
    ),
  }),
]);
