import { Suspense } from "react";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { ShellHeaderLeading, ShellHeaderMenu, ShellSidebarIdentity } from "@/components/dashboard/shell-identity";
import {
  HeaderLeadingSkeleton,
  HeaderMenuSkeleton,
  SidebarIdentitySkeleton,
} from "@/components/dashboard/shell-identity-client";

/**
 * The shell (nav, search, notifications) paints without waiting for the
 * viewer: identity resolves in streaming islands that share one memoized DAL
 * call. No `force-dynamic` here — the layout itself is static and only the
 * islands and the page segments are dynamic.
 */
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <DashboardShell
      sidebarIdentity={
        <Suspense fallback={<SidebarIdentitySkeleton />}>
          <ShellSidebarIdentity />
        </Suspense>
      }
      headerLeading={
        <Suspense fallback={<HeaderLeadingSkeleton />}>
          <ShellHeaderLeading />
        </Suspense>
      }
      headerMenu={
        <Suspense fallback={<HeaderMenuSkeleton />}>
          <ShellHeaderMenu />
        </Suspense>
      }
    >
      {children}
    </DashboardShell>
  );
}
