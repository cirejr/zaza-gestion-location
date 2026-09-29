"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  Bell,
  Building2,
  ClipboardList,
  FileText,
  LayoutDashboard,
  LogOut,
  Menu,
  Receipt,
  Settings,
  Users,
  WalletCards,
  Wrench,
  Droplets,
  ChevronRight,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";
import type { ApiUser } from "@/lib/dashboard-types";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
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
import { Separator } from "@/components/ui/separator";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
} from "@/components/ui/sidebar";

const navGroups: Array<{ label: string; items: Array<{ label: string; href: string; icon: LucideIcon }> }> = [
  {
    label: "Pilotage",
    items: [
      { label: "Vue d’ensemble", href: "/", icon: LayoutDashboard },
      { label: "Immeubles & unités", href: "/buildings", icon: Building2 },
      { label: "Locataires", href: "/tenants", icon: Users },
      { label: "Baux", href: "/leases", icon: FileText },
    ],
  },
  {
    label: "Argent & services",
    items: [
      { label: "Paiements", href: "/payments", icon: WalletCards },
      { label: "Factures communes", href: "/utilities", icon: Droplets },
      { label: "Incidents & travaux", href: "/tickets", icon: Wrench },
    ],
  },
  {
    label: "Analyses",
    items: [
      { label: "Rapports", href: "/reports", icon: Activity },
      { label: "Équipe", href: "/team", icon: UsersRound },
    ],
  },
];

function isActivePath(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

function initials(name: string) {
  return name.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase();
}

export function DashboardShell({ user, children }: { user: ApiUser; children: React.ReactNode }) {
  const pathname = usePathname();
  const current = navGroups.flatMap((group) => group.items).find((item) => isActivePath(pathname, item.href));

  async function signOut() {
    await authClient.signOut();
    window.location.href = "/login";
  }

  return (
    <SidebarProvider>
      <Sidebar collapsible="icon" className="bg-sidebar text-sidebar-foreground">
        <SidebarHeader className="border-b border-sidebar-border">
          <Link href="/" className="flex items-center gap-3 px-2 py-2">
            <span className="flex size-9 items-center justify-center rounded-xl bg-sidebar-primary text-sidebar-primary-foreground font-black">n</span>
            <span className="group-data-[collapsible=icon]:hidden">
              <span className="block text-lg font-black tracking-[-0.06em]">naya</span>
              <span className="block text-[9px] font-semibold uppercase tracking-[0.17em] text-sidebar-foreground/60">gestion locative</span>
            </span>
          </Link>
        </SidebarHeader>
        <SidebarContent>
          {navGroups.map((group) => (
            <SidebarGroup key={group.label}>
              <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    return (
                      <SidebarMenuItem key={item.href}>
                        <SidebarMenuButton
                          render={<Link href={item.href} />}
                          isActive={isActivePath(pathname, item.href)}
                          tooltip={item.label}
                        >
                          <Icon />
                          <span>{item.label}</span>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          ))}
        </SidebarContent>
        <SidebarFooter className="border-t border-sidebar-border">
          <div className="flex items-center gap-3 rounded-xl bg-sidebar-accent/50 p-3 group-data-[collapsible=icon]:hidden">
            <Avatar className="size-8"><AvatarFallback>{initials(user.name)}</AvatarFallback></Avatar>
            <div className="min-w-0 flex-1"><p className="truncate text-xs font-bold">{user.name}</p><p className="truncate text-[10px] text-sidebar-foreground/60">{user.email}</p></div>
            <Button variant="ghost" size="icon-sm" onClick={() => void signOut()} aria-label="Se déconnecter"><LogOut /></Button>
          </div>
          <SidebarMenu>
            <SidebarMenuItem><SidebarMenuButton tooltip="Paramètres"><Settings /><span>Paramètres</span></SidebarMenuButton></SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>
      <SidebarInset>
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b bg-background/95 px-4 backdrop-blur sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <SidebarTrigger className="md:hidden" />
            <div><p className="text-[10px] font-semibold text-muted-foreground">Naya / {current?.label ?? "Pilotage"}</p><h1 className="text-lg font-bold tracking-tight">{current?.label ?? "Vue d’ensemble"}</h1></div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" aria-label="Rechercher"><span className="text-xs">⌘K</span></Button>
            <Button variant="outline" size="icon" className="relative" aria-label="Notifications"><Bell /><span className="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-destructive" /></Button>
            <Separator orientation="vertical" className="mx-1 hidden h-6 sm:block" />
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button variant="ghost" className="gap-2 px-2" />}>
                <Avatar className="size-8"><AvatarFallback>{initials(user.name)}</AvatarFallback></Avatar>
                <span className="hidden text-left sm:block"><span className="block max-w-28 truncate text-xs font-semibold">{user.name}</span><span className="block text-[10px] text-muted-foreground">{user.role === "owner" ? "Propriétaire" : user.role === "manager" ? "Gérant" : "Locataire"}</span></span>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>{user.email}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuItem render={<Link href="/reports" />}><Activity />Rapports</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => void signOut()}><LogOut />Se déconnecter</DropdownMenuItem>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>
        <div className="flex-1 p-4 sm:p-6 lg:p-8">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
