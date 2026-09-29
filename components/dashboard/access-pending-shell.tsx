"use client";

import { Hourglass } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import type { ApiUser } from "@/lib/dashboard-types";

/**
 * Tenant accounts cannot access the management dashboard until an owner
 * promotes them. Show a clean pending screen instead of the shell so the
 * role flows (owner → manager promotion) stay understandable.
 */
export function AccessPendingShell({ user }: { user: ApiUser }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-background p-6">
      <div className="flex size-12 items-center justify-center rounded-xl bg-primary text-primary-foreground font-black">n</div>
      <div className="mt-6 flex max-w-sm flex-col items-center gap-2 text-center">
        <span className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground"><Hourglass /></span>
        <h1 className="text-lg font-bold">Accès en attente d’approbation</h1>
        <p className="text-sm text-muted-foreground">
          Bonjour <span className="font-semibold text-foreground">{user.name}</span>. Votre espace Naya a été créé avec un
          profil locataire : un propriétaire doit le passer en «&nbsp;gérant&nbsp;» pour que vous puissiez gérer les immeubles.
        </p>
        <button
          type="button"
          onClick={async () => {
            await authClient.signOut();
            window.location.href = "/login";
          }}
          className="mt-4 rounded-lg border border-input px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
        >
          Se déconnecter
        </button>
      </div>
    </div>
  );
}