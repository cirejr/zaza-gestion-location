"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";

/**
 * Leave the active agency. The owner cannot leave (the agency would be
 * orphaned), so the action is reserved to managers.
 */
export function LeaveAgencyCard({ organizationId, canLeave, agencyName }: { organizationId: string; canLeave: boolean; agencyName: string }) {
  const router = useRouter();
  const [leaving, setLeaving] = useState(false);

  async function leave() {
    if (!window.confirm(`Quitter l’agence « ${agencyName} » ? Vous perdrez l’accès à ses biens.`)) return;
    setLeaving(true);
    try {
      await authClient.organization.leave({ organizationId });
      toast.success("Vous avez quitté l’agence.");
      router.push("/");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Impossible de quitter l’agence.");
    } finally {
      setLeaving(false);
    }
  }

  return (
    <Card className="border-destructive/40">
      <CardHeader>
        <CardTitle className="text-destructive">Zone sensible</CardTitle>
        <CardDescription>
          {canLeave
            ? "Quittez cette agence pour retirer votre accès à ses biens et données."
            : "En tant que propriétaire, vous ne pouvez pas quitter l’agence. Confiez le rôle de propriétaire à un autre membre au préalable."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button type="button" variant="destructive" disabled={!canLeave || leaving} onClick={() => void leave()}>
          {leaving ? <Spinner data-icon="inline-start" /> : <LogOut data-icon="inline-start" />}
          Quitter l’agence
        </Button>
      </CardContent>
    </Card>
  );
}
