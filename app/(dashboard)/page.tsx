import { OverviewView } from "@/components/dashboard/overview-view";
import { requireDashboardUser } from "@/lib/dashboard-guard";
import { serverApiFetch } from "@/lib/server-api";
import type { ApiBuilding, ApiList, ApiReport, PaymentRow } from "@/lib/dashboard-types";

export default async function DashboardPage() {
  const period = new Date().toISOString().slice(0, 7);
  const user = await requireDashboardUser();
  const [buildings, payments, report] = await Promise.all([
    serverApiFetch<ApiList<ApiBuilding>>("/api/buildings?limit=100"),
    serverApiFetch<ApiList<PaymentRow>>("/api/payments?limit=5"),
    serverApiFetch<{ data: ApiReport }>(`/api/reports/summary?period=${period}`),
  ]);
  return <OverviewView buildings={buildings.data} payments={payments.data} report={report.data} user={user} />;
}
