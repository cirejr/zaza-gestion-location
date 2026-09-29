"use client";

import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function ListControls({
  query,
  page,
  limit,
  total,
  placeholder = "Rechercher…",
}: {
  query?: string;
  page: number;
  limit: number;
  total: number;
  placeholder?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [draft, setDraft] = useState(query ?? "");

  const pages = Math.max(1, Math.ceil(total / limit));
  const safePage = Math.min(page, pages);

  function navigate(nextParams: Record<string, string | undefined>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(nextParams)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    router.push(`?${params.toString()}`);
    router.refresh();
  }

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    navigate({ q: draft.trim() || undefined, page: undefined });
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <form onSubmit={handleSearch} className="relative w-full sm:max-w-xs">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={placeholder} className="pl-9" />
      </form>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>
          {total} résultat{total > 1 ? "s" : ""} — page {safePage}/{pages}
        </span>
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="Page précédente"
          disabled={safePage <= 1}
          onClick={() => navigate({ page: String(safePage - 1) })}
        >
          <ChevronLeft />
        </Button>
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="Page suivante"
          disabled={safePage >= pages}
          onClick={() => navigate({ page: String(safePage + 1) })}
        >
          <ChevronRight />
        </Button>
      </div>
    </div>
  );
}