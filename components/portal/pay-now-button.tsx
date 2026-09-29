"use client";

import { Copy, ExternalLink, QrCode } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { ApiError, apiFetch } from "@/lib/api";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";

/**
 * "Payer maintenant" from the tenant portal: requests a mobile-money payment
 * link for a pending payment and shows the URL to open/copy. Requires the
 * payment provider credentials to be configured (Phase 3).
 */
export function PayNowButton({ paymentId, amount }: { paymentId: string; amount: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paymentUrl, setPaymentUrl] = useState<string | null>(null);

  async function createLink() {
    setError(null);
    setLoading(true);
    try {
      const result = await apiFetch<{ data: { paymentUrl: string } }>(`/api/portal/payments/${paymentId}/create-link`, {
        method: "POST",
        body: JSON.stringify({ provider: "paytech" }),
      });
      setPaymentUrl(result.data.paymentUrl);
      toast.success("Lien de paiement généré.");
      router.refresh();
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : requestError instanceof Error ? requestError.message : "Une erreur est survenue.");
    } finally {
      setLoading(false);
    }
  }

  function copyLink() {
    if (!paymentUrl) return;
    void navigator.clipboard?.writeText(paymentUrl).then(() => toast.success("Lien copié."));
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (next && !paymentUrl) void createLink(); }}>
      <DialogTrigger render={<Button size="sm" variant="default" />}>
        <QrCode data-icon="inline-start" />
        Payer maintenant
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Paiement en ligne — {amount}</DialogTitle>
          <DialogDescription>
            {loading
              ? "Création du lien de paiement mobile money…"
              : "Ouvrez le lien dans votre téléphone pour régler via Wave, Orange Money, MTN MoMo ou carte."}
          </DialogDescription>
        </DialogHeader>
        {loading && (
          <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
            <Spinner /> Contact du prestataire…
          </div>
        )}
        {error && (
          <Alert variant="destructive">
            <AlertTitle>Paiement indisponible</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {!loading && !error && paymentUrl && (
          <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 p-2.5">
            <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{paymentUrl}</span>
            <Button type="button" variant="ghost" size="icon-sm" aria-label="Copier le lien" onClick={copyLink}><Copy /></Button>
          </div>
        )}
        <DialogFooter>
          {!loading && !error && paymentUrl && (
            <Button render={<a href={paymentUrl} target="_blank" rel="noreferrer" />} className="w-full sm:w-auto">
              <ExternalLink data-icon="inline-start" />Ouvrir le lien
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}