"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, Check, ChevronsUpDown } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type Agency = { id: string; name: string };

/**
 * Switch the active agency (Better Auth organization) from the header. A user
 * only sees this when they belong to more than one agency; otherwise the active
 * agency is surfaced as a static label so the header is never empty.
 */
export function AgencySwitcher({ currentOrganizationId }: { currentOrganizationId?: string | null }) {
  const router = useRouter();
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let active = true;
    void authClient.organization.list().then(({ data }) => {
      if (active && data) setAgencies(data.map((agency) => ({ id: agency.id, name: agency.name })));
    });
    return () => {
      active = false;
    };
  }, []);

  const current = agencies.find((agency) => agency.id === currentOrganizationId) ?? agencies[0];

  async function activate(id: string) {
    if (id === current?.id) return;
    setPending(true);
    try {
      await authClient.organization.setActive({ organizationId: id });
      // The active agency is read from the session on the server: reload to
      // re-render every scoped query against the new agency.
      router.refresh();
      window.location.reload();
    } finally {
      setPending(false);
    }
  }

  if (agencies.length <= 1) {
    if (!current) return null;
    return (
      <span className="hidden items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs font-semibold text-muted-foreground sm:flex">
        <Building2 className="size-3.5" />
        <span className="max-w-40 truncate">{current.name}</span>
      </span>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" className="gap-2 px-2" disabled={pending} />}>
        <Building2 className="size-4" />
        <span className="hidden max-w-32 truncate text-xs font-semibold sm:block">{current?.name ?? "Agence"}</span>
        <ChevronsUpDown className="size-3.5 opacity-60" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-60">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Mes agences</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {agencies.map((agency) => (
            <DropdownMenuItem key={agency.id} onClick={() => void activate(agency.id)}>
              {agency.id === current?.id ? <Check /> : <Building2 />}
              <span className="truncate">{agency.name}</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
