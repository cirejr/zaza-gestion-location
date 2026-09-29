import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { getServerSession } from "@/lib/session";
import { serverApiFetch } from "@/lib/server-api";
import type { ApiUser } from "@/lib/dashboard-types";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession();
  if (!session) redirect("/login?redirect=/");
  // Phone-only tenant accounts have no dashboard identity — send them to their portal.
  if (!session.user.email) redirect("/espace-locataire");
  const response = await serverApiFetch<{ data: ApiUser }>("/api/users/me");
  // Tenant-role accounts use the tenant portal instead of the management dashboard.
  if (response.data.role === "tenant") redirect("/espace-locataire");
  return <DashboardShell user={response.data}>{children}</DashboardShell>;
}