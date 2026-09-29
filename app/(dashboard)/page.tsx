import { OverviewView } from "@/components/dashboard/overview-view";
import { requireDashboardUser } from "@/lib/dashboard-guard";

export default async function DashboardPage() {
  const user = await requireDashboardUser();
  return <OverviewView user={user} />;
}