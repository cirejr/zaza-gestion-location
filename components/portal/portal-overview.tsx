import { Download, Droplets, FileText, Home, ReceiptText, WalletCards } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PayNowButton } from "@/components/portal/pay-now-button";
import { PortalSignOut } from "@/components/portal/portal-sign-out";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { ServerApiError, serverApiFetch } from "@/lib/server-api";
import type { PortalMe } from "@/lib/dashboard-types";
import { formatCfa, formatDate } from "@/lib/dashboard-utils";

function utilityLabel(type: string) {
  const labels: Record<string, string> = { water: "Eau", electricity: "Électricité", security: "Sécurité", other: "Autres charges" };
  return labels[type] ?? type;
}

function UnlinkedState({ message }: { message: string }) {
  return (
    <div className="mx-auto max-w-lg px-6 py-16 text-center">
      <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground"><FileText /></span>
      <h2 className="mt-4 text-xl font-bold">Compte non rattaché</h2>
      <p className="mt-2 text-sm text-muted-foreground">{message}</p>
      <div className="mt-6 flex justify-center gap-2">
        <PortalSignOut />
      </div>
    </div>
  );
}

export async function PortalOverview() {
  let data: PortalMe["data"] | null = null;
  let message = "Votre numéro n’est rattaché à aucun locataire de la plateforme.";

  try {
    const response = await serverApiFetch<PortalMe>("/api/portal/me");
    data = response.data;
  } catch (error) {
    message = error instanceof ServerApiError ? error.message : "Le service est momentanément indisponible. Réessayez dans quelques instants.";
  }

  if (!data) return <UnlinkedState message={message} />;

  const { tenant, building, apartment, lease, pendingPayments, paymentHistory, utilityNotes, stats } = data;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-primary">Espace locataire</p>
          <h1 className="mt-1 text-2xl font-black tracking-tight">Bonjour {tenant.fullName}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {building ? `${building.name}${building.city ? ` — ${building.city}` : ""}` : "Aucun bail actif"} · {apartment?.unitNumber ?? "—"}
            {lease ? ` · depuis le ${formatDate(lease.startDate)}` : ""}
          </p>
        </div>
        <PortalSignOut />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card><CardHeader><CardDescription>Montant dû</CardDescription><CardTitle className="text-destructive">{formatCfa(stats.totalDue)}</CardTitle></CardHeader></Card>
        <Card><CardHeader><CardDescription>Total réglé</CardDescription><CardTitle>{formatCfa(stats.paidTotal)}</CardTitle></CardHeader></Card>
        <Card><CardHeader><CardDescription>Paiements payés</CardDescription><CardTitle>{stats.paidCount}</CardTitle></CardHeader></Card>
      </div>

      {pendingPayments.length > 0 && (
        <Card className="border-destructive/40">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><WalletCards /> Échéances en attente</CardTitle>
            <CardDescription>{pendingPayments.length} paiement(s) à régler{lease ? ` pour ${apartment?.unitNumber}` : ""}.</CardDescription>
          </CardHeader>
          <CardContent className="px-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Échéance</TableHead>
                  <TableHead>Montant</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingPayments.map((payment) => (
                  <TableRow key={payment.id}>
                    <TableCell className="text-xs text-muted-foreground">{formatDate(payment.createdAt)}</TableCell>
                    <TableCell className="text-sm font-bold">{formatCfa(payment.amount)}</TableCell>
                    <TableCell><StatusBadge status="pending" /></TableCell>
                    <TableCell className="text-right">
                      <PayNowButton paymentId={payment.id} amount={formatCfa(payment.amount)} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Home /> Votre bail</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            {lease ? (
              <>
                <dl className="grid grid-cols-2 gap-3">
                  <div><dt className="text-xs text-muted-foreground">Immeuble</dt><dd className="font-semibold">{building?.name ?? "—"}</dd></div>
                  <div><dt className="text-xs text-muted-foreground">Unité</dt><dd className="font-semibold">{apartment?.unitNumber ?? "—"}</dd></div>
                  <div><dt className="text-xs text-muted-foreground">Loyer mensuel</dt><dd className="font-semibold">{formatCfa(lease.rentAmount)}</dd></div>
                  <div><dt className="text-xs text-muted-foreground">Dépôt de garantie</dt><dd className="font-semibold">{formatCfa(lease.depositAmount)}</dd></div>
                  <div><dt className="text-xs text-muted-foreground">Début</dt><dd>{formatDate(lease.startDate)}</dd></div>
                  <div><dt className="text-xs text-muted-foreground">Fin</dt><dd>{lease.endDate ? formatDate(lease.endDate) : "Bail à durée indéterminée"}</dd></div>
                </dl>
                <Badge variant={lease.status === "active" ? "default" : "outline"} className="w-fit">
                  {lease.status === "active" ? "Bail actif" : lease.status === "draft" ? "Brouillon" : lease.status === "expired" ? "Expiré" : "Terminé"}
                </Badge>
              </>
            ) : (
              <p className="text-muted-foreground">Aucun bail rattaché à votre profil. Contactez votre gestionnaire.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Droplets /> Notes de charges</CardTitle>
            <CardDescription>Répartition des factures communes de votre résidence.</CardDescription>
          </CardHeader>
          <CardContent className="px-0">
            {utilityNotes.length ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Charge</TableHead>
                    <TableHead>Période</TableHead>
                    <TableHead>Montant</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {utilityNotes.map((note) => (
                    <TableRow key={note.id}>
                      <TableCell className="text-sm font-medium">{utilityLabel(note.type)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{note.period}</TableCell>
                      <TableCell className="text-sm font-semibold">{formatCfa(note.amount)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="px-6 pb-6 text-sm text-muted-foreground">Aucune note de charges pour le moment.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><ReceiptText /> Historique des paiements</CardTitle>
          <CardDescription>Téléchargez vos reçus au format PDF.</CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          {paymentHistory.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Montant</TableHead>
                  <TableHead>Moyen</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead className="text-right">Reçu</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paymentHistory.map((payment) => (
                  <TableRow key={payment.id}>
                    <TableCell className="text-xs text-muted-foreground">{formatDate(payment.paidAt ?? payment.createdAt)}</TableCell>
                    <TableCell className="text-sm font-bold">{formatCfa(payment.amount)}</TableCell>
                    <TableCell className="text-xs">{payment.paymentMethod}</TableCell>
                    <TableCell><StatusBadge status={payment.status} /></TableCell>
                    <TableCell className="text-right">
                      {payment.status === "paid" && (
                        <Button render={<a href={`/api/portal/payments/${payment.id}/receipt.pdf`} target="_blank" rel="noreferrer" />} variant="ghost" size="icon-sm" aria-label="Télécharger le reçu">
                          <Download />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="px-6 pb-6 text-sm text-muted-foreground">Aucun paiement enregistré.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}