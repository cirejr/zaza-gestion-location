import { OverviewView } from "@/components/dashboard/overview-view";
import { serverApiFetch } from "@/lib/server-api";
import type { ApiBuilding, ApiList, ApiReport, ApiUser, PaymentRow } from "@/lib/dashboard-types";

export default async function DashboardPage() {
  const period = new Date().toISOString().slice(0, 7);
  const [buildings, payments, report, user] = await Promise.all([
    serverApiFetch<ApiList<ApiBuilding>>("/api/buildings?limit=100"),
    serverApiFetch<ApiList<PaymentRow>>("/api/payments?limit=5"),
    serverApiFetch<{ data: ApiReport }>(`/api/reports/summary?period=${period}`),
    serverApiFetch<{ data: ApiUser }>("/api/users/me"),
  ]);
  return <OverviewView buildings={buildings.data} payments={payments.data} report={report.data} user={user.data} />;
}
