"use client";

import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import type { Column, RowData } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { DataTableFeatures } from "@/components/ui/data-table-features";

interface DataTableColumnHeaderProps<TData extends RowData, TValue> {
  column: Column<DataTableFeatures, TData, TValue>;
  title: string;
  className?: string;
}

/**
 * Sortable header for a data-table column. Falls back to a plain label when
 * the column can't be sorted. Prefix with an `accessorKey`/`accessorFn` and a
 * registered `sortFn` ("text" | "alphanumeric") to make a column sortable.
 */
export function DataTableColumnHeader<TData extends RowData, TValue>({ column, title, className }: DataTableColumnHeaderProps<TData, TValue>) {
  if (!column.getCanSort()) {
    return <span className={className}>{title}</span>;
  }

  const sorted = column.getIsSorted();

  return (
    <Button
      variant="ghost"
      size="sm"
      className={cn("-ml-3 h-8", className)}
      onClick={() => column.toggleSorting(sorted === "asc")}
      aria-label={`Trier par ${title}`}
    >
      {title}
      {sorted === "asc" ? (
        <ArrowUp data-icon="inline-end" />
      ) : sorted === "desc" ? (
        <ArrowDown data-icon="inline-end" />
      ) : (
        <ArrowUpDown data-icon="inline-end" className="text-muted-foreground" />
      )}
    </Button>
  );
}