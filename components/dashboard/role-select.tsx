"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { ApiError, apiFetch } from "@/lib/api";
import type { ApiUser } from "@/lib/dashboard-types";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";

const roleLabels: Record<ApiUser["role"], string> = {
  owner: "Propriétaire",
  manager: "Gérant",
  tenant: "Locataire",
};

export function RoleSelect({ user }: { user: ApiUser }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function changeRole(role: string) {
    if (role === user.role) return;
    if (user.role === "owner" && role !== "owner" && !window.confirm("Retirer votre rôle de propriétaire ? Cette action est irréversible.")) return;
    setLoading(true);
    try {
      await apiFetch(`/api/users/${user.id}/role`, { method: "PATCH", body: JSON.stringify({ role }) });
      toast.success(`Rôle mis à jour : ${roleLabels[role as keyof typeof roleLabels] ?? role}.`);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Impossible de modifier le rôle.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Select value={user.role} onValueChange={(value) => void changeRole(value as string)}>
        <SelectTrigger disabled={loading} className="w-36">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {(["owner", "manager", "tenant"] as const).map((role) => (
            <SelectItem key={role} value={role}>
              {roleLabels[role]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {loading && <Spinner className="size-4" />}
    </div>
  );
}