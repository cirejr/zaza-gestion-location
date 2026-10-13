"use client";

import Link from "next/link";
import { Activity, Building2, LogOut } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import type { ApiUser } from "@/lib/dashboard-types";
import { AgencySwitcher } from "@/components/dashboard/agency-switcher";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
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
import { Skeleton } from "@/components/ui/skeleton";

function initials(name: string) {
  return name.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase();
}

export async function signOutToLogin() {
  await authClient.signOut();
  window.location.href = "/login";
}

/** Sidebar footer card: who is signed in, with a sign-out action. */
export function SidebarUserCard({ user }: { user: ApiUser }) {
  return (
    <div className="flex items-center gap-3 rounded-xl bg-sidebar-accent/50 p-3 group-data-[collapsible=icon]:hidden">
      <Avatar className="size-8"><AvatarFallback>{initials(user.name)}</AvatarFallback></Avatar>
      <div className="min-w-0 flex-1"><p className="truncate text-xs font-bold">{user.name}</p><p className="truncate text-[10px] text-sidebar-foreground/60">{user.email}</p></div>
      <Button variant="ghost" size="icon-sm" onClick={() => void signOutToLogin()} aria-label="Se déconnecter"><LogOut /></Button>
    </div>
  );
}

/** Header agency switcher, fed by the viewer instead of a second lookup. */
export function HeaderAgencySwitcher({ user }: { user: ApiUser }) {
  return <AgencySwitcher currentOrganizationId={user.organization?.id} />;
}

/** Header account menu: name, role, shortcuts, sign-out. */
export function HeaderAccountMenu({ user }: { user: ApiUser }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" className="gap-2 px-2" />}>
        <Avatar className="size-8"><AvatarFallback>{initials(user.name)}</AvatarFallback></Avatar>
        <span className="hidden text-left sm:block"><span className="block max-w-28 truncate text-xs font-semibold">{user.name}</span><span className="block text-[10px] text-muted-foreground">{user.role === "owner" ? "Propriétaire" : user.role === "manager" ? "Gérant" : "Locataire"}</span></span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel>{user.email}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem render={<Link href="/reports" />}><Activity />Rapports</DropdownMenuItem>
          <DropdownMenuItem onClick={() => void signOutToLogin()}><LogOut />Se déconnecter</DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function SidebarIdentitySkeleton() {
  return (
    <div className="flex items-center gap-3 rounded-xl bg-sidebar-accent/50 p-3 group-data-[collapsible=icon]:hidden">
      <Skeleton className="size-8 rounded-full" />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5"><Skeleton className="h-3 w-24" /><Skeleton className="h-2.5 w-32" /></div>
    </div>
  );
}

export function HeaderLeadingSkeleton() {
  return (
    <span className="hidden items-center gap-2 rounded-lg border px-2.5 py-1.5 sm:flex">
      <Building2 className="size-3.5 text-muted-foreground" />
      <Skeleton className="h-3 w-24" />
    </span>
  );
}

export function HeaderMenuSkeleton() {
  return <Skeleton className="size-8 rounded-full" />;
}
