"use client";

import { Bell, CheckCheck, Inbox } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";
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

export type NotificationItem = {
  id: string;
  type: string;
  title: string;
  body?: string | null;
  href?: string | null;
  readAt?: string | null;
  createdAt: string;
};

type NotificationResponse = { data: NotificationItem[]; unread: number };

function relativeTime(value: string) {
  const date = new Date(value);
  const minutes = Math.round((Date.now() - date.getTime()) / 60000);
  if (minutes < 1) return "à l’instant";
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `il y a ${hours} h`;
  const days = Math.round(hours / 24);
  if (days === 1) return "hier";
  if (days < 7) return `il y a ${days} j`;
  return date.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });
}

/**
 * Header inbox for domain events (payments received, new tickets, portal
 * payment requests). Fetches on mount and whenever it opens; marking as read is
 * optimistic so the dot disappears immediately.
 */
export function NotificationBell() {
  const router = useRouter();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const response = await apiFetch<NotificationResponse>("/api/notifications?limit=8");
      setItems(response.data);
      setUnread(response.unread);
    } catch {
      /* The bell is non-critical: ignore transient failures. */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function open(item: NotificationItem) {
    if (!item.readAt) {
      setItems((current) => current.map((entry) => (entry.id === item.id ? { ...entry, readAt: new Date().toISOString() } : entry)));
      setUnread((count) => Math.max(0, count - 1));
      try {
        await apiFetch(`/api/notifications/${item.id}/read`, { method: "POST" });
      } catch {
        /* Keep the optimistic state. */
      }
    }
    if (item.href) router.push(item.href);
  }

  async function markAll() {
    setItems((current) => current.map((entry) => ({ ...entry, readAt: entry.readAt ?? new Date().toISOString() })));
    setUnread(0);
    try {
      await apiFetch("/api/notifications/read-all", { method: "POST" });
    } catch {
      /* Keep the optimistic state. */
    }
  }

  return (
    <DropdownMenu onOpenChange={(isOpen) => { if (isOpen) void load(); }}>
      <DropdownMenuTrigger render={<Button variant="outline" size="icon" className="relative" aria-label="Notifications" />}>
        <Bell />
        {unread > 0 && <span className="absolute right-1.5 top-1.5 size-2 rounded-full bg-destructive" />}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="flex items-center justify-between">
            <span>Notifications</span>
            {unread > 0 && <span className="text-[10px] font-semibold text-foreground">{unread} non lue{unread > 1 ? "s" : ""}</span>}
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        {loading ? (
          <div className="flex flex-col gap-2 p-2">
            {Array.from({ length: 3 }).map((_, index) => <Skeleton key={index} className="h-10 w-full" />)}
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center gap-1 px-4 py-8 text-center">
            <Inbox className="size-5 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Aucune notification.</p>
          </div>
        ) : (
          <div className="flex max-h-80 flex-col overflow-y-auto">
            {items.map((item) => (
              <DropdownMenuItem key={item.id} onClick={() => void open(item)} className="items-start gap-2 py-2">
                <span className={cn("mt-1.5 size-1.5 shrink-0 rounded-full", item.readAt ? "bg-transparent" : "bg-primary")} />
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className={cn("truncate text-sm", item.readAt ? "font-medium text-muted-foreground" : "font-semibold")}>{item.title}</span>
                  {item.body && <span className="truncate text-xs text-muted-foreground">{item.body}</span>}
                  <span className="text-[10px] text-muted-foreground">{relativeTime(item.createdAt)}</span>
                </span>
              </DropdownMenuItem>
            ))}
          </div>
        )}
        {unread > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => void markAll()}>
              <CheckCheck />
              Tout marquer comme lu
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
