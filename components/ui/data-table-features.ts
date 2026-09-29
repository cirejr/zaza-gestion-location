import {
  createSortedRowModel,
  rowSortingFeature,
  sortFn_alphanumeric,
  sortFn_text,
  tableFeatures,
} from "@tanstack/react-table";

/**
 * Shared TanStack Table v9 feature set for every page-level data table.
 *
 * The app paginates and searches server-side (ListControls + API query params),
 * so pagination/filtering features stay out of the client bundle. Sorting is
 * the only client behavior these tables need; extend this object centrally if
 * more features (column visibility, row selection, …) are required later.
 */
export const features = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns: { alphanumeric: sortFn_alphanumeric, text: sortFn_text },
});

/** Pass as the first generic argument to `ColumnDef`, `Column`, `Table` and `Row`. */
export type DataTableFeatures = typeof features;