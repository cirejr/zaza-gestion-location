"use client";

import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type ComponentType, type KeyboardEvent } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type CommandItem = {
  id: string;
  label: string;
  group: string;
  icon?: ComponentType<{ className?: string }>;
  href?: string;
  onSelect?: () => void;
};

/**
 * ⌘K / Ctrl+K command palette. Purely client-side: it filters the navigation
 * entries (plus a few account actions) handed in by the dashboard shell, so it
 * needs no API and works from every dashboard page.
 */
export function CommandPalette({
  open,
  onOpenChange,
  items,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: CommandItem[];
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);

  const results = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return items;
    return items.filter((item) => `${item.label} ${item.group}`.toLowerCase().includes(needle));
  }, [items, query]);

  // Group the filtered results while preserving the source order.
  const groups = useMemo(() => {
    const map = new Map<string, CommandItem[]>();
    for (const item of results) {
      const bucket = map.get(item.group);
      if (bucket) bucket.push(item);
      else map.set(item.group, [item]);
    }
    return [...map.entries()];
  }, [results]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActive(0);
    }
  }, [open]);

  useEffect(() => {
    setActive(0);
  }, [query]);

  useEffect(() => {
    if (active > results.length - 1) setActive(Math.max(0, results.length - 1));
  }, [active, results.length]);

  function run(item: CommandItem) {
    onOpenChange(false);
    if (item.onSelect) item.onSelect();
    else if (item.href) router.push(item.href);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((index) => Math.min(index + 1, results.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((index) => Math.max(index - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const item = results[active];
      if (item) run(item);
    }
  }

  let flatIndex = -1;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="top-[15%] max-w-lg translate-y-0 gap-0 overflow-hidden p-0 sm:max-w-lg"
      >
        <DialogTitle className="sr-only">Recherche rapide</DialogTitle>
        <div className="flex items-center gap-2 border-b px-3">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <Input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Rechercher une page ou une action…"
            className="h-11 border-0 px-0 focus-visible:ring-0"
          />
        </div>
        <div className="max-h-80 overflow-y-auto p-2">
          {groups.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">Aucun résultat.</p>
          ) : (
            groups.map(([group, groupItems]) => (
              <div key={group} className="mb-1">
                <p className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{group}</p>
                {groupItems.map((item) => {
                  flatIndex += 1;
                  const index = flatIndex;
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onMouseEnter={() => setActive(index)}
                      onClick={() => run(item)}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm",
                        index === active ? "bg-muted" : "hover:bg-muted/60",
                      )}
                    >
                      {Icon && <Icon className="size-4 text-muted-foreground" />}
                      <span className="flex-1 truncate">{item.label}</span>
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
