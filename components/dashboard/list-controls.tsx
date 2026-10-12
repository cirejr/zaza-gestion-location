"use client";

import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export type ListFilterOption = { value: string; label: string };

export type ListFilter = {
  /** Query-string parameter filled by this control (e.g. `status`, `priority`). */
  name: string;
  label: string;
  /** Choices for a `select` filter. Ignored for input types. */
  options?: ListFilterOption[];
  /** Currently selected value — omit or pass `""` for "all". */
  value?: string;
  /** Label of the "all" choice, e.g. "Tous les statuts". */
  allLabel?: string;
  /** Control type. `select` (default) renders a dropdown; other types render inputs. */
  type?: "select" | "text" | "number" | "date";
  /** Placeholder for input types. */
  placeholder?: string;
};

/**
 * Sentinel for the "all" choice: Base UI's Select treats an empty string as
 * "no value" (it would show the placeholder), so a real item value is needed.
 */
const ALL = "__all__";

export function ListControls({
  query,
  page,
  limit,
  total,
  placeholder = "Rechercher…",
  filters = [],
}: {
  query?: string;
  page: number;
  limit: number;
  total: number;
  placeholder?: string;
  filters?: ListFilter[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [draft, setDraft] = useState(query ?? "");

  // Keep the input in sync when navigation changes the query (back/forward,
  // cleared search) instead of only initializing once.
  useEffect(() => {
    setDraft(query ?? "");
  }, [query]);

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
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <form onSubmit={handleSearch} className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={placeholder} className="pl-9" />
        </form>
        {filters.map((filter) =>
          filter.type && filter.type !== "select" ? (
            <FilterField key={filter.name} filter={filter} navigate={navigate} />
          ) : (
            <Select
              key={filter.name}
              value={filter.value ? filter.value : ALL}
              items={[{ value: ALL, label: filter.allLabel ?? "Tous" }, ...(filter.options ?? [])]}
              onValueChange={(value) => navigate({ [filter.name]: value === ALL ? undefined : String(value), page: undefined })}
            >
              <SelectTrigger className="w-full sm:w-44" aria-label={filter.label}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value={ALL}>{filter.allLabel ?? "Tous"}</SelectItem>
                  {(filter.options ?? []).map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          ),
        )}
      </div>
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

/**
 * Text / number / date filter. Commits on blur or Enter so typing does not
 * fire a navigation per keystroke, and resets the page when the value changes.
 */
function FilterField({ filter, navigate }: { filter: ListFilter; navigate: (params: Record<string, string | undefined>) => void }) {
  const [draft, setDraft] = useState(filter.value ?? "");

  useEffect(() => {
    setDraft(filter.value ?? "");
  }, [filter.value]);

  function commit() {
    const value = draft.trim();
    if (value === (filter.value ?? "").trim()) return;
    navigate({ [filter.name]: value || undefined, page: undefined });
  }

  return (
    <Input
      type={filter.type ?? "text"}
      inputMode={filter.type === "number" ? "numeric" : undefined}
      aria-label={filter.label}
      placeholder={filter.placeholder ?? filter.label}
      value={draft}
      onChange={(event) => {
        setDraft(event.target.value);
        // A native date picker sets the whole value at once and may not blur,
        // so commit immediately for dates instead of waiting for blur/Enter.
        if (filter.type === "date") {
          const value = event.target.value.trim();
          if (value !== (filter.value ?? "").trim()) navigate({ [filter.name]: value || undefined, page: undefined });
        }
      }}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          commit();
        }
      }}
      className="w-full sm:w-40"
    />
  );
}
