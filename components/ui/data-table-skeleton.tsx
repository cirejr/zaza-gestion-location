import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface DataTableSkeletonProps {
  /** Number of skeleton body rows. */
  rows?: number;
  /** Number of columns (one header + one cell placeholder per row). */
  columns?: number;
}

function cellWidth(colIndex: number, columns: number) {
  if (colIndex === 0) return "w-32";
  if (colIndex === 1) return "w-24";
  if (colIndex === columns - 1) return "ml-auto w-14";
  return "w-16";
}

/**
 * Skeleton that mirrors the structure of `<DataTable />` (same table
 * primitives), so it can be dropped into a page `<Suspense fallback>`
 * while a section is still fetching its rows.
 */
export function DataTableSkeleton({ rows = 5, columns = 5 }: DataTableSkeletonProps) {
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            {Array.from({ length: columns }).map((_, index) => (
              <TableHead key={index}>
                <Skeleton className="h-3.5 w-20" />
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: rows }).map((_, rowIndex) => (
            <TableRow key={rowIndex}>
              {Array.from({ length: columns }).map((_, colIndex) => (
                <TableCell key={colIndex}>
                  <Skeleton className={`h-4 ${cellWidth(colIndex, columns)}`} />
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}