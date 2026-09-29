import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { DataTableSkeleton } from "@/components/ui/data-table-skeleton";

/** Skeleton strip mirroring `<ListControls />` (search input + pager). */
export function ListControlsSkeleton() {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <Skeleton className="h-9 w-full max-w-xs" />
      <div className="flex items-center gap-2">
        <Skeleton className="h-6 w-28" />
        <Skeleton className="size-8 rounded-md" />
        <Skeleton className="size-8 rounded-md" />
      </div>
    </div>
  );
}

/** Grid of KPI card skeletons (summary rows). */
export function KpiGridSkeleton({ count = 3, block = 3 }: { count?: number; block?: 2 | 3 | 4 }) {
  const gridClass = block === 4 ? "sm:grid-cols-2 xl:grid-cols-4" : block === 2 ? "sm:grid-cols-2" : "sm:grid-cols-3";
  return (
    <div className={`grid gap-4 ${gridClass}`}>
      {Array.from({ length: count }).map((_, index) => (
        <Card key={index}>
          <CardHeader className="gap-2">
            <CardDescription>
              <Skeleton className="h-3 w-24" />
            </CardDescription>
            <CardTitle>
              <Skeleton className="h-7 w-20" />
            </CardTitle>
          </CardHeader>
        </Card>
      ))}
    </div>
  );
}

/** Card frame with a skeleton description line + skeleton table. */
export function TableCardSkeleton({ title, rows = 5, columns = 5 }: { title: string; rows?: number; columns?: number }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>
          <Skeleton className="h-3 w-32" />
        </CardDescription>
      </CardHeader>
      <CardContent className="px-0">
        <DataTableSkeleton rows={rows} columns={columns} />
      </CardContent>
    </Card>
  );
}

/** Small skeleton button for header actions that need to fetch their options. */
export function ButtonSkeleton({ className = "h-10 w-44" }: { className?: string }) {
  return <Skeleton className={`rounded-md ${className}`} />;
}

/** Grid of building-card skeletons (buildings overview). */
export function BuildingGridSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: count }).map((_, index) => (
        <Card key={index} className="overflow-hidden">
          <div className="h-2 bg-primary/40" />
          <CardHeader className="gap-2">
            <CardTitle>
              <Skeleton className="h-5 w-40" />
            </CardTitle>
            <CardDescription>
              <Skeleton className="h-4 w-24" />
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Skeleton className="h-6 w-28" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-9 w-full rounded-md" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}