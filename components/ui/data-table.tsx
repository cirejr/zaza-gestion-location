"use client";

import * as React from "react";
import { useTable, type ColumnDef, type RowData, type SortingState } from "@tanstack/react-table";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { features, type DataTableFeatures } from "@/components/ui/data-table-features";

interface DataTableProps<TData extends RowData> {
  columns: ColumnDef<DataTableFeatures, TData>[];
  data: TData[];
  emptyMessage?: string;
}

/**
 * Generic data table built on TanStack Table v9 + shadcn `<Table />`.
 * Only the `columns` vary per page: define them with `createColumnHelper`
 * (in a "use client" module) and pass the serialized rows from the page.
 */
export function DataTable<TData extends RowData>({ columns, data, emptyMessage = "Aucun résultat." }: DataTableProps<TData>) {
  const [sorting, setSorting] = React.useState<SortingState>([]);

  const table = useTable({
    features,
    data,
    columns,
    onSortingChange: setSorting,
    state: { sorting },
  });

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <TableHead key={header.id}>
                  {header.isPlaceholder ? null : <table.FlexRender header={header} />}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.length ? (
            table.getRowModel().rows.map((row) => (
              <TableRow key={row.id}>
                {row.getAllCells().map((cell) => (
                  <TableCell key={cell.id}>
                    <table.FlexRender cell={cell} />
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={columns.length} className="h-32 text-center text-sm text-muted-foreground">
                {emptyMessage}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}