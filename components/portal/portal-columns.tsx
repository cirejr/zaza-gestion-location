"use client";

import { Download } from "lucide-react";
import { createColumnHelper } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PayNowButton } from "@/components/portal/pay-now-button";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { DataTableColumnHeader } from "@/components/ui/data-table-column-header";
import type { DataTableFeatures } from "@/components/ui/data-table-features";
import type { ApiPayment, PortalClaim, PortalTicket, PortalUtilityNote } from "@/lib/dashboard-types";
import { formatCfa, formatDate } from "@/lib/dashboard-utils";

const paymentColumnHelper = createColumnHelper<DataTableFeatures, ApiPayment>();
const noteColumnHelper = createColumnHelper<DataTableFeatures, PortalUtilityNote>();
const ticketColumnHelper = createColumnHelper<DataTableFeatures, PortalTicket>();
const claimColumnHelper = createColumnHelper<DataTableFeatures, PortalClaim>();

const utilityLabel = (type: string) => {
  const labels: Record<string, string> = { water: "Eau", electricity: "Électricité", security: "Sécurité", other: "Autres charges" };
  return labels[type] ?? type;
};

const categoryLabel = (category: string) => {
  const labels: Record<string, string> = { reparation: "Réparation", degradation: "Dégradation", autre: "Autre" };
  return labels[category] ?? category;
};

const claimTypeLabel = (type: string) => {
  const labels: Record<string, string> = { deposit: "Dépôt de garantie", reparation: "Réparation", autre: "Autre" };
  return labels[type] ?? type;
};

/** Échéances en attente de paiement (portail locataire). */
export const pendingPaymentColumns = paymentColumnHelper.columns([
  paymentColumnHelper.accessor((row) => row.createdAt, {
    id: "createdAt",
    header: () => <span>Échéance</span>,
    cell: ({ row }) => <span className="text-xs text-muted-foreground">{formatDate(row.original.createdAt)}</span>,
  }),
  paymentColumnHelper.accessor((row) => Number(row.amount), {
    id: "amount",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Montant" />,
    sortFn: "alphanumeric",
    cell: ({ row }) => <span className="text-sm font-bold">{formatCfa(row.original.amount)}</span>,
  }),
  paymentColumnHelper.accessor((row) => row.status, {
    id: "status",
    header: () => <span>Statut</span>,
    cell: () => <StatusBadge status="pending" />,
  }),
  paymentColumnHelper.display({
    id: "actions",
    header: () => <span className="block text-right">Action</span>,
    cell: ({ row }) => (
      <div className="flex justify-end">
        <PayNowButton paymentId={row.original.id} amount={formatCfa(row.original.amount)} />
      </div>
    ),
  }),
]);

/** Notes de charges communes (portail locataire). */
export const utilityNoteColumns = noteColumnHelper.columns([
  noteColumnHelper.accessor((row) => utilityLabel(row.type), {
    id: "type",
    header: () => <span>Charge</span>,
    cell: ({ row }) => <span className="text-sm font-medium">{utilityLabel(row.original.type)}</span>,
  }),
  noteColumnHelper.accessor((row) => row.period, {
    id: "period",
    header: () => <span>Période</span>,
    cell: ({ row }) => <span className="text-xs text-muted-foreground">{row.original.period}</span>,
  }),
  noteColumnHelper.accessor((row) => Number(row.amount), {
    id: "amount",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Montant" />,
    sortFn: "alphanumeric",
    cell: ({ row }) => <span className="text-sm font-semibold">{formatCfa(row.original.amount)}</span>,
  }),
]);

/** Historique des paiements (portail locataire). */
export const paymentHistoryColumns = paymentColumnHelper.columns([
  paymentColumnHelper.accessor((row) => row.paidAt ?? row.createdAt, {
    id: "date",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Date" />,
    sortFn: "text",
    cell: ({ row }) => <span className="text-xs text-muted-foreground">{formatDate(row.original.paidAt ?? row.original.createdAt)}</span>,
  }),
  paymentColumnHelper.accessor((row) => Number(row.amount), {
    id: "amount",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Montant" />,
    sortFn: "alphanumeric",
    cell: ({ row }) => <span className="text-sm font-bold">{formatCfa(row.original.amount)}</span>,
  }),
  paymentColumnHelper.accessor((row) => row.paymentMethod, {
    id: "method",
    header: () => <span>Moyen</span>,
    cell: ({ row }) => <span className="text-xs">{row.original.paymentMethod}</span>,
  }),
  paymentColumnHelper.accessor((row) => row.status, {
    id: "status",
    header: () => <span>Statut</span>,
    cell: ({ row }) => <StatusBadge status={row.original.status} />,
  }),
  paymentColumnHelper.display({
    id: "receipt",
    header: () => <span className="block text-right">Reçu</span>,
    cell: ({ row }) =>
      row.original.status === "paid" ? (
        <div className="flex justify-end">
          <Button render={<a href={`/api/portal/payments/${row.original.id}/receipt.pdf`} target="_blank" rel="noreferrer" />} variant="ghost" size="icon-sm" aria-label="Télécharger le reçu">
            <Download />
          </Button>
        </div>
      ) : null,
  }),
]);

/** Demandes de travaux / dégradations déclarées par le locataire. */
export const portalTicketColumns = ticketColumnHelper.columns([
  ticketColumnHelper.accessor((row) => row.title, {
    id: "title",
    header: () => <span>Demande</span>,
    cell: ({ row }) => (
      <div className="min-w-0">
        <span className="block truncate text-sm font-semibold">{row.original.title}</span>
        <span className="block max-w-56 truncate text-xs text-muted-foreground">{row.original.description}</span>
      </div>
    ),
  }),
  ticketColumnHelper.accessor((row) => categoryLabel(row.category), {
    id: "category",
    header: () => <span>Type</span>,
    cell: ({ row }) => <Badge variant="secondary" className="w-fit">{categoryLabel(row.original.category)}</Badge>,
  }),
  ticketColumnHelper.accessor((row) => row.priority, {
    id: "priority",
    header: () => <span>Priorité</span>,
    cell: ({ row }) => <StatusBadge status={row.original.priority} />,
  }),
  ticketColumnHelper.accessor((row) => row.createdAt, {
    id: "createdAt",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Date" />,
    sortFn: "text",
    cell: ({ row }) => <span className="text-xs text-muted-foreground">{formatDate(row.original.createdAt)}</span>,
  }),
  ticketColumnHelper.accessor((row) => row.status, {
    id: "status",
    header: () => <span>Statut</span>,
    cell: ({ row }) => <StatusBadge status={row.original.status} />,
  }),
]);

/** Réclamations soumises par le locataire. */
export const portalClaimColumns = claimColumnHelper.columns([
  claimColumnHelper.accessor((row) => row.title, {
    id: "title",
    header: () => <span>Réclamation</span>,
    cell: ({ row }) => (
      <div className="min-w-0">
        <span className="block truncate text-sm font-semibold">{row.original.title}</span>
        <span className="block max-w-56 truncate text-xs text-muted-foreground">{row.original.description}</span>
      </div>
    ),
  }),
  claimColumnHelper.accessor((row) => claimTypeLabel(row.type), {
    id: "type",
    header: () => <span>Type</span>,
    cell: ({ row }) => <span className="text-xs">{claimTypeLabel(row.original.type)}</span>,
  }),
  claimColumnHelper.accessor((row) => (row.amount == null ? 0 : Number(row.amount)), {
    id: "amount",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Montant" />,
    sortFn: "alphanumeric",
    cell: ({ row }) => (row.original.amount == null ? <span className="text-xs text-muted-foreground">—</span> : <span className="text-sm font-semibold">{formatCfa(row.original.amount)}</span>),
  }),
  claimColumnHelper.accessor((row) => row.createdAt, {
    id: "createdAt",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Date" />,
    sortFn: "text",
    cell: ({ row }) => <span className="text-xs text-muted-foreground">{formatDate(row.original.createdAt)}</span>,
  }),
  claimColumnHelper.accessor((row) => row.status, {
    id: "status",
    header: () => <span>Statut</span>,
    cell: ({ row }) => <StatusBadge status={row.original.status} />,
  }),
]);