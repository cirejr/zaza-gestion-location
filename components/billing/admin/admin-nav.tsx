"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building2, ClipboardList, CreditCard, LayoutDashboard, Tags, type LucideIcon } from "lucide-react";

export type AdminNavItem = { label: string; href: string; icon: LucideIcon; badge?: number };

export function adminNavItems(pending: number): AdminNavItem[] {
  return [
    { label: "Vue d’ensemble", href: "/admin", icon: LayoutDashboard },
    { label: "Agences", href: "/admin/agences", icon: Building2 },
    { label: "Demandes", href: "/admin/demandes", icon: ClipboardList, badge: pending },
    { label: "Abonnements", href: "/admin/abonnements", icon: CreditCard },
    { label: "Tarifs & paiements", href: "/admin/tarifs", icon: Tags },
  ];
}

function isActive(pathname: string, href: string) {
  return href === "/admin" ? pathname === "/admin" : pathname === href || pathname.startsWith(`${href}/`);
}

export function AdminNav({ pending, orientation = "vertical" }: { pending: number; orientation?: "vertical" | "horizontal" }) {
  const pathname = usePathname();
  const items = adminNavItems(pending);
  return (
    <nav className={orientation === "vertical" ? "flex flex-col gap-1" : "flex gap-1 overflow-x-auto"}>
      {items.map((item) => {
        const Icon = item.icon;
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
              active ? "bg-secondary text-secondary-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground"
            }`}
          >
            <Icon className="size-4" />
            {item.label}
            {typeof item.badge === "number" && item.badge > 0 && (
              <span className="ml-auto rounded-full bg-primary px-2 py-0.5 text-[11px] font-bold text-primary-foreground">
                {item.badge}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
