import { redirect } from "next/navigation";
import { AccessPendingShell } from "@/components/dashboard/access-pending-shell";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { getServerSession } from "@/lib/session";
import { serverApiFetch } from "@/lib/server-api";
import type { ApiUser } from "@/lib/dashboard-types";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession();
  if (!session) redirect("/login?redirect=/");
  const response = await serverApiFetch<{ data: ApiUser }>("/api/users/me");
  if (response.data.role === "tenant") return <AccessPendingShell user={response.data} />;
  return <DashboardShell user={response.data}>{children}</DashboardShell>;
}