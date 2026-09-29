"use client";

import { MessageCircle } from "lucide-react";
import { createColumnHelper } from "@tanstack/react-table";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { DataTableColumnHeader } from "@/components/ui/data-table-column-header";
import type { DataTableFeatures } from "@/components/ui/data-table-features";
import type { TenantOverviewRow } from "@/lib/dashboard-types";
import { formatDate, initials } from "@/lib/dashboard-utils";

const columnHelper = createColumnHelper<DataTableFeatures, TenantOverviewRow>();

export const tenantColumns = columnHelper.columns([
  columnHelper.accessor((row) => row.fullName, {
    id: "fullName",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Locataire" />,
    sortFn: "text",
    cell: ({ row }) => (
      <div className="flex items-center gap-2">
        <span className="flex size-8 items-center justify-center rounded-full bg-secondary text-[10px] font-bold">{initials(row.original.fullName)}</span>
        <span className="text-sm font-semibold">{row.original.fullName}</span>
      </div>
    ),
  }),
  columnHelper.accessor((row) => row.whatsappNumber ?? row.phone, {
    id: "contact",
    header: () => <span>Contact</span>,
    cell: ({ row }) => <span className="text-xs text-muted-foreground">{row.original.whatsappNumber ?? row.original.phone}</span>,
  }),
  columnHelper.accessor((row) => (row.lease ? `${row.lease.apartment.unitNumber} ${row.lease.lease.startDate}` : ""), {
    id: "lease",
    header: () => <span>Unité / bail</span>,
    cell: ({ row }) => {
      const lease = row.original.lease;
      return lease ? (
        <>
          <span className="font-semibold">{lease.apartment.unitNumber}</span>
          <span className="block text-muted-foreground">{formatDate(lease.lease.startDate)}{lease.lease.endDate ? ` → ${formatDate(lease.lease.endDate)}` : ""}</span>
        </>
      ) : (
        <span className="text-muted-foreground">Aucun bail</span>
      );
    },
  }),
  columnHelper.accessor((row) => row.lease?.lease.status ?? "vacant", {
    id: "status",
    header: () => <span>Statut</span>,
    cell: ({ row }) => <StatusBadge status={row.original.lease?.lease.status ?? "vacant"} />,
  }),
  columnHelper.display({
    id: "contactAction",
    header: () => <span className="block text-right">Action</span>,
    cell: ({ row }) => (
      <div className="flex justify-end">
        <a
          href={`https://wa.me/${(row.original.whatsappNumber ?? row.original.phone).replace(/[^0-9]/g, "")}`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-8 items-center justify-center gap-1 rounded-lg px-2 text-xs font-medium text-foreground hover:bg-muted"
          aria-label={`Contacter ${row.original.fullName} sur WhatsApp`}
        >
          <MessageCircle /> WhatsApp
        </a>
      </div>
    ),
  }),
]);