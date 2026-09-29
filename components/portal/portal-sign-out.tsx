"use client";

import { LogOut } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";

export function PortalSignOut() {
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={async () => {
        await authClient.signOut();
        window.location.href = "/espace-locataire";
      }}
    >
      <LogOut data-icon="inline-start" />
      Se déconnecter
    </Button>
  );
}