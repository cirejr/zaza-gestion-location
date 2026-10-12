"use client";

import Link from "next/link";
import { useState } from "react";
import { UserSearch } from "lucide-react";
import { apiFetch } from "@/lib/api";
import type { ApiApartmentProspectMatch } from "@/lib/dashboard-types";
import { formatDate } from "@/lib/dashboard-utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Empty, EmptyContent, EmptyDescription, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Spinner } from "@/components/ui/spinner";

/**
 * Reverse of the prospect-centric matching: given an apartment, rank the
 * prospects that fit it. Used when a unit frees up and the manager wants to
 * know who to call first.
 */
export function ApartmentProspectMatches({ apartmentId, unitNumber }: { apartmentId: string; unitNumber: string }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [matches, setMatches] = useState<ApiApartmentProspectMatch[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const response = await apiFetch<{ data: ApiApartmentProspectMatch[] }>(`/api/prospects/matching?apartmentId=${apartmentId}`);
      setMatches(response.data);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Chargement impossible.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Button
        variant="outline"
        size="icon-sm"
        title="Prospects correspondants"
        aria-label="Prospects correspondants"
        onClick={() => {
          setOpen(true);
          if (matches === null) void load();
        }}
      >
        <UserSearch />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Prospects correspondants — unité {unitNumber}</DialogTitle>
            <DialogDescription>Prospects classés par pertinence pour cette unité.</DialogDescription>
          </DialogHeader>
          {loading && (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
              <Spinner />
              Chargement…
            </div>
          )}
          {!loading && error && <p className="py-6 text-center text-sm text-destructive">{error}</p>}
          {!loading && !error && matches && matches.length === 0 && (
            <Empty className="border">
              <EmptyMedia variant="icon"><UserSearch /></EmptyMedia>
              <EmptyContent>
                <EmptyTitle>Aucun prospect</EmptyTitle>
                <EmptyDescription>Aucun prospect actif ne correspond à cette unité pour l’instant.</EmptyDescription>
              </EmptyContent>
            </Empty>
          )}
          {!loading && !error && matches && matches.length > 0 && (
            <ul className="flex max-h-[26rem] flex-col gap-2 overflow-y-auto">
              {matches.slice(0, 25).map((match) => (
                <li key={match.prospect.id} className="rounded-lg border border-border p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link href={`/prospects/${match.prospect.id}`} className="text-sm font-semibold hover:underline">
                        {match.prospect.fullName}
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        {match.prospect.phone}
                        {match.prospect.moveInDate ? ` · emménagement ${formatDate(match.prospect.moveInDate)}` : ""}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <Badge variant="secondary">Score {match.score}</Badge>
                      <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                        {match.availableNow ? "Disponible" : match.availableAtMoveIn ? "Dispo. à l’emménagement" : "Indisponible"}
                      </span>
                    </div>
                  </div>
                  {(match.reasons.length > 0 || match.issues.length > 0) && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {match.reasons.slice(0, 4).map((reason) => (
                        <Badge key={reason} variant="outline" className="text-[10px] font-normal">
                          {reason}
                        </Badge>
                      ))}
                      {match.issues.map((issue) => (
                        <Badge key={issue} variant="outline" className="border-amber-300 text-[10px] font-medium text-amber-700">
                          {issue}
                        </Badge>
                      ))}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
