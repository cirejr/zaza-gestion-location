import { UsersRound } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RoleSelect } from "@/components/dashboard/role-select";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { PageHeader } from "@/components/dashboard/page-header";
import { requireDashboardUser } from "@/lib/dashboard-guard";
import { serverApiFetch } from "@/lib/server-api";
import type { ApiList, ApiUser } from "@/lib/dashboard-types";
import { initials } from "@/lib/dashboard-utils";

export const dynamic = "force-dynamic";

export default async function TeamPage() {
  await requireDashboardUser();
  let users: ApiUser[] = [];
  let forbidden = false;
  try {
    const response = await serverApiFetch<ApiList<ApiUser>>("/api/users");
    users = response.data;
  } catch {
    forbidden = true;
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
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Membre</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Rôle</TableHead>
                  <TableHead className="text-right">Modifier</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="flex size-8 items-center justify-center rounded-full bg-secondary text-[10px] font-bold">{initials(user.name)}</span>
                        <span className="text-sm font-semibold">{user.name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{user.email}</TableCell>
                    <TableCell>
                      <StatusBadge status={user.role} />
                    </TableCell>
                    <TableCell className="text-right"><RoleSelect user={user} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}