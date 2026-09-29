import { Skeleton } from "@/components/ui/skeleton";

export default function DashboardLoading() {
  return <div className="flex flex-col gap-6"><div className="grid gap-4 lg:grid-cols-[1.35fr_.65fr]"><Skeleton className="h-56 rounded-2xl" /><Skeleton className="h-56 rounded-2xl" /></div><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-36 rounded-2xl" />)}</div><Skeleton className="h-80 rounded-2xl" /></div>;
}
