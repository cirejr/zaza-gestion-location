"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building2, CreditCard, ScrollText, UserRound, UsersRound, type LucideIcon } from "lucide-react";

const items: Array<{ label: string; href: string; icon: LucideIcon }> = [
  { label: "Compte", href: "/settings", icon: UserRound },
  { label: "Agence", href: "/settings/organisation", icon: Building2 },
  { label: "Équipe", href: "/settings/equipe", icon: UsersRound },
  { label: "Abonnement", href: "/billing/subscription", icon: CreditCard },
  { label: "Politique", href: "/policy", icon: ScrollText },
];

function isActive(pathname: string, href: string) {
  return href === "/settings" ? pathname === "/settings" : pathname === href || pathname.startsWith(`${href}/`);
}

export function SettingsNav() {
  const pathname = usePathname();
  return (
    <nav className="flex flex-wrap gap-1 rounded-xl border bg-card p-1 sm:inline-flex sm:flex-nowrap">
      {items.map((item) => {
        const Icon = item.icon;
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
              active ? "bg-secondary text-secondary-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground"
            }`}
          >
            <Icon className="size-4" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
