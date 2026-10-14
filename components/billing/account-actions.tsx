"use client";

import { useState, type FormEvent } from "react";
import { Download, LifeBuoy, ScrollText } from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import { BILLING_POLICY_VERSION, POLICY_PATH } from "@/lib/billing-policy";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";

const SUPPORT_EMAIL = process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? "";

export function PolicyAcceptance({ acceptedVersion }: { acceptedVersion: string | null }) {
  const [accepted, setAccepted] = useState(false);
  const [working, setWorking] = useState(false);
  if (acceptedVersion === BILLING_POLICY_VERSION) return null;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!accepted) {
      toast.error("Cochez la case pour accepter la politique.");
      return;
    }
    setWorking(true);
    try {
      await apiFetch("/api/account/policy", {
        method: "POST",
        body: JSON.stringify({ version: BILLING_POLICY_VERSION }),
      });
      toast.success("Politique acceptée.");
      window.location.reload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Enregistrement impossible.");
    } finally {
      setWorking(false);
    }
  }

  return (
    <Card className="border-amber-500/50 bg-amber-500/10">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><ScrollText className="size-4" />Politique de facturation à accepter</CardTitle>
        <CardDescription>
          Avant de payer, lisez et acceptez la <a className="underline" href={POLICY_PATH}>politique de facturation</a> (version {BILLING_POLICY_VERSION}).
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} className="size-4" />
            J’ai lu et j’accepte la politique de facturation.
          </label>
          <Button type="submit" size="sm" disabled={working}>
            {working ? <Spinner data-icon="inline-start" /> : null}Accepter
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

export function AccountActions({ isOwner }: { isOwner: boolean }) {
  const [reason, setReason] = useState("");
  const [working, setWorking] = useState(false);
  const [exporting, setExporting] = useState(false);

  async function downloadExport() {
    setExporting(true);
    try {
      const response = await fetch("/api/account/export", { credentials: "include" });
      if (!response.ok) throw new Error(`Export impossible (${response.status}).`);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `naya-export-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
      toast.success("Export téléchargé.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Export impossible.");
    } finally {
      setExporting(false);
    }
  }

  async function requestClosure(event: FormEvent) {
    event.preventDefault();
    if (!reason.trim()) {
      toast.error("Indiquez un motif.");
      return;
    }
    setWorking(true);
    try {
      await apiFetch("/api/account/closure", {
        method: "POST",
        body: JSON.stringify({ reason }),
      });
      toast.success("Demande envoyée à l’administrateur.");
      setReason("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Envoi impossible.");
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <Card id="support" className="scroll-mt-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><LifeBuoy className="size-4" />Support & données</CardTitle>
          <CardDescription>Vos données ne sont jamais supprimées automatiquement.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm">
          {SUPPORT_EMAIL ? (
            <p>
              Contact : <a className="underline" href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
            </p>
          ) : (
            <p className="text-muted-foreground">
              Pour toute question (facture, reçu, accès), utilisez la demande de fermeture/assistance
              ci-contre — un administrateur vous répondra. Détails dans la <a className="underline" href={POLICY_PATH}>politique de facturation</a>.
            </p>
          )}
          <div>
            <Button variant="outline" size="sm" onClick={() => void downloadExport()} disabled={exporting}>
              {exporting ? <Spinner data-icon="inline-start" /> : <Download data-icon="inline-start" />}
              Exporter mes données (JSON)
            </Button>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Demande de fermeture / assistance</CardTitle>
          <CardDescription>Réservé au propriétaire. Un administrateur traitera la demande.</CardDescription>
        </CardHeader>
        <CardContent>
          {!isOwner ? (
            <p className="text-sm text-muted-foreground">Seul le propriétaire de l’agence peut envoyer cette demande.</p>
          ) : (
            <form onSubmit={requestClosure}>
              <FieldGroup>
                <Field>
                  <FieldLabel>Motif</FieldLabel>
                  <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ex. fermeture de l’agence, question sur un paiement…" />
                </Field>
                <div>
                  <Button type="submit" size="sm" variant="outline" disabled={working}>
                    {working ? <Spinner data-icon="inline-start" /> : null}Envoyer la demande
                  </Button>
                </div>
              </FieldGroup>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
