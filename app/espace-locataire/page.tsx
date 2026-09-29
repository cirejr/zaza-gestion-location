import { Suspense } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PortalLogin } from "@/components/portal/portal-login";
import { PortalOverview } from "@/components/portal/portal-overview";
import { getServerSession } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * Tenant portal: phone + WhatsApp OTP sign-in, then a read-only view of the
 * tenant’s own lease, dues, payment history (receipts) and utility notes.
 */
export default async function EspaceLocatairePage() {
  const session = await getServerSession();
  if (!session) return <PortalLogin />;
  return (
    <Suspense fallback={<PortalSkeleton />}>
      <PortalOverview />
    </Suspense>
  );
}

function PortalSkeleton() {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-4 w-72" />
        </div>
        <Skeleton className="h-9 w-24 rounded-md" />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <Card key={index}>
            <CardHeader className="gap-2">
              <CardDescription><Skeleton className="h-3 w-24" /></CardDescription>
              <CardTitle><Skeleton className="h-7 w-20" /></CardTitle>
            </CardHeader>
          </Card>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-56 rounded-2xl" />
        <Skeleton className="h-56 rounded-2xl" />
      </div>
      <Card>
        <CardHeader><CardTitle><Skeleton className="h-5 w-48" /></CardTitle><CardDescription><Skeleton className="h-3 w-40" /></CardDescription></CardHeader>
        <CardContent className="flex flex-col gap-3">
          {Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-9 w-full" />)}
        </CardContent>
      </Card>
    </div>
  );
}