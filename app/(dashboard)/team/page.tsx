import { UsersRound } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { PageHeader } from "@/components/dashboard/page-header";
import { teamColumns } from "./columns";
import { requireDashboardUser } from "@/lib/dashboard-guard";
import { ServerApiError, serverApiFetch } from "@/lib/server-api";
import type { ApiList, ApiUser } from "@/lib/dashboard-types";

export const dynamic = "force-dynamic";

export default async function TeamPage() {
  await requireDashboardUser();
  let users: ApiUser[] = [];
  let forbidden = false;
  try {
    const response = await serverApiFetch<ApiList<ApiUser>>("/api/users");
    users = response.data;
  } catch (error) {
    // Only an owner can list/manage the team: surface that as the reserved-card,
    // but let real failures (DB outage, etc.) reach the app error handling.
    if (error instanceof ServerApiError && error.status === 403) forbidden = true;
    else throw error;
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader eyebrow="Administration" title="Équipe" description="Attribuez les rôles propriétaire, gérant ou locataire." />
      {forbidden ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-sm font-medium">Accès réservé au propriétaire.</p>
            <p className="mt-1 text-sm text-muted-foreground">Contactez le propriétaire de l’espace pour gérer les rôles.</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <div>
              <CardDescription>Comptes</CardDescription>
              <CardTitle>{users.length} membre(s)</CardTitle>
            </div>
            <span className="flex size-9 items-center justify-center rounded-xl bg-secondary text-secondary-foreground"><UsersRound /></span>
          </CardHeader>
          <CardContent className="px-0">
            <DataTable columns={teamColumns} data={users} emptyMessage="Aucun membre dans l’équipe." />
          </CardContent>
        </Card>
      )}
    </div>
  );
}