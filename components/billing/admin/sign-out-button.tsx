"use client";

import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";

export function AdminSignOutButton() {
  const router = useRouter();
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => {
        void authClient.signOut({
          fetchOptions: {
            onSuccess: () => {
              router.push("/login");
              router.refresh();
            },
          },
        });
      }}
    >
      <LogOut data-icon="inline-start" />
      Déconnexion
    </Button>
  );
}
