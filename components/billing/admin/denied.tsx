import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/** Shown when the visitor is not a platform admin (Better Auth `admin` role). */
export function AdminDenied() {
  return (
    <Card>
      <CardHeader><CardTitle>Accès refusé</CardTitle></CardHeader>
      <CardContent className="text-sm text-muted-foreground">
        Cette section est réservée à l’administrateur de la plateforme (rôle <code>admin</code> Better Auth).
        Demandez une promotion via <code>bun scripts/promote-admin.ts votre@email</code>.
      </CardContent>
    </Card>
  );
}
