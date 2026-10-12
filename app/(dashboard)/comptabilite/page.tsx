import Link from "next/link";
import { ArrowRight, Download, Wallet } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/dashboard/page-header";
import { PeriodPicker } from "@/components/dashboard/accounting/period-picker";
import { requireDashboardUser } from "@/lib/dashboard-guard";
import { serverApiFetch } from "@/lib/server-api";
import { formatFcfa, monthLabel } from "@/lib/dashboard-utils";
import type { AccountingOverview, ApiList, ApiUser } from "@/lib/dashboard-types";

export const dynamic = "force-dynamic";

type BuildingOption = { id: string; name: string };

function currentPeriod() {
  return new Date().toISOString().slice(0, 7);
}

export default async function AccountingPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; buildingId?: string; ownerId?: string; category?: string }>;
}) {
  const params = await searchParams;
  const period = /^\d{4}-\d{2}$/.test(params.period ?? "") ? (params.period as string) : currentPeriod();
  const buildingId = params.buildingId ?? "";
  const ownerId = params.ownerId ?? "";
  const category = params.category ?? "";
  const user = await requireDashboardUser();

  const [overview, buildings, owners] = await Promise.all([
    serverApiFetch<{ data: AccountingOverview }>(`/api/accounts/overview?${new URLSearchParams({ period, ...(buildingId ? { buildingId } : {}), ...(ownerId ? { ownerId } : {}), ...(category ? { category } : {}) }).toString()}`),
    serverApiFetch<ApiList<BuildingOption>>("/api/buildings?limit=100"),
    user.role === "owner"
      ? serverApiFetch<{ data: ApiUser[] }>("/api/users").catch(() => ({ data: [] as ApiUser[] }))
      : Promise.resolve({ data: [] as ApiUser[] }),
  ]);
  const data = overview.data;
  const ownerOptions = owners.data.filter((entry) => entry.role === "owner");

  const exportParams = new URLSearchParams({ period, format: "csv" });
  if (data.buildingId) exportParams.set("buildingId", data.buildingId);

  const seriesMax = Math.max(1, ...data.series.map((point) => Math.max(point.rentCollected, point.expenses)));
  const stats = [
    { label: "Loyers facturés", value: data.rentBilled, hint: "Loyers émis sur la période" },
    { label: "Loyers encaissés", value: data.rentCollected, hint: "Paiements confirmés", tone: "positive" as const },
    { label: "Impayés", value: data.outstanding, hint: "Facturé − encaissé", tone: data.outstanding > 0 ? ("negative" as const) : undefined },
    { label: "Autres revenus", value: data.otherIncome, hint: "Hors loyers" },
    { label: "Dépenses", value: data.expenses, hint: `Dont propriétaire : ${formatFcfa(data.expensesOwner)}` },
    { label: "Résultat", value: data.netOperatingIncome, hint: "Encaissé + revenus − dépenses", tone: data.netOperatingIncome >= 0 ? ("positive" as const) : ("negative" as const) },
    { label: "Frais de gestion", value: data.managementFeeEarned, hint: "Rémunération de l’agence" },
    { label: "Dû aux propriétaires", value: data.ownerPayable, hint: "Net à verser" },
    { label: "Versé", value: data.remitted, hint: "Déjà reversé" },
    { label: "Reste à verser", value: data.ownerRemaining, hint: "Dû − versé", tone: data.ownerRemaining > 0 ? ("negative" as const) : undefined },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Comptabilité"
        title="Vue comptable"
        description="Loyers, charges, résultat et situation des comptes de l’agence et des propriétaires."
        action={
          <div className="flex items-center gap-2">
            <PeriodPicker period={period} />
            <Button variant="outline" render={<Link href="/comptabilite/grand-livre" />}>
              Grand livre
              <ArrowRight data-icon="inline-end" />
            </Button>
          </div>
        }
      />

      <Card>
        <CardContent className="pt-6">
          <form method="get" className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="period" value={period} />
            <label className="flex flex-col gap-1 text-xs font-semibold text-muted-foreground">
              Immeuble
              <select name="buildingId" defaultValue={data.buildingId ?? ""} className="h-9 min-w-44 rounded-md border border-input bg-transparent px-2 text-sm">
                <option value="">Tous les immeubles</option>
                {buildings.data.map((building) => (
                  <option key={building.id} value={building.id}>
                    {building.name}
                  </option>
                ))}
              </select>
            </label>
            {ownerOptions.length > 0 && (
              <label className="flex flex-col gap-1 text-xs font-semibold text-muted-foreground">
                Propriétaire
                <select name="ownerId" defaultValue={ownerId} className="h-9 min-w-44 rounded-md border border-input bg-transparent px-2 text-sm">
                  <option value="">Tous les propriétaires</option>
                  {ownerOptions.map((owner) => (
                    <option key={owner.id} value={owner.id}>
                      {owner.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="flex flex-col gap-1 text-xs font-semibold text-muted-foreground">
              Catégorie
              <Input name="category" defaultValue={category} placeholder="ex. plomberie" className="h-9 w-44" />
            </label>
            <Button type="submit" variant="outline">
              Filtrer
            </Button>
            <Button type="button" variant="ghost" render={<Link href={`/comptabilite?period=${period}`} />}>
              Réinitialiser
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <CardContent className="flex flex-col gap-1 pt-6">
              <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">{stat.label}</p>
              <p
                className={
                  stat.tone === "positive"
                    ? "text-xl font-black tracking-tight text-emerald-600"
                    : stat.tone === "negative"
                      ? "text-xl font-black tracking-tight text-destructive"
                      : "text-xl font-black tracking-tight"
                }
              >
                {formatFcfa(stat.value)}
              </p>
              <p className="text-[11px] text-muted-foreground">{stat.hint}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Revenus & dépenses par mois</CardTitle>
            <CardDescription>Loyers encaissés et dépenses sur les six derniers mois.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {data.series.map((point) => (
              <div key={point.period} className="flex items-center gap-3">
                <span className="w-14 shrink-0 text-xs font-semibold text-muted-foreground">{monthLabel(point.period)}</span>
                <div className="flex flex-1 items-center gap-2">
                  <div className="h-3 flex-1 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.max(2, (point.rentCollected / seriesMax) * 100)}%` }} />
                  </div>
                  <div className="h-3 flex-1 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-rose-400" style={{ width: `${Math.max(2, (point.expenses / seriesMax) * 100)}%` }} />
                  </div>
                </div>
                <span className="hidden w-40 shrink-0 text-right text-xs text-muted-foreground sm:block">
                  <span className="text-emerald-600">{formatFcfa(point.rentCollected)}</span> · <span className="text-rose-500">{formatFcfa(point.expenses)}</span>
                </span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <div className="flex flex-col gap-1">
              <CardTitle>Comptes</CardTitle>
              <CardDescription>Trésorerie connue par compte.</CardDescription>
            </div>
            <Button variant="outline" render={<a href={`/api/reports/accounting/accounts?${exportParams.toString()}`} />}>
              <Download data-icon="inline-start" />
              Comptes CSV
            </Button>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {data.accounts.length === 0 && <p className="text-sm text-muted-foreground">Aucun compte enregistré. Créez-en un dans le grand livre.</p>}
            {data.accounts.map((account) => (
              <div key={account.id} className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Wallet className="size-4 text-muted-foreground" />
                  <div className="flex flex-col">
                    <span className="text-sm font-semibold">{account.name}</span>
                    <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{account.type.replace("_", " ")}</span>
                  </div>
                </div>
                <span className={account.balance < 0 ? "text-sm font-bold text-destructive" : "text-sm font-bold"}>{formatFcfa(account.balance)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <CardTitle>Détail par immeuble</CardTitle>
            <CardDescription>Performance et montant dû par propriété sur {period}.</CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" render={<a href={`/api/reports/accounting/rent?${exportParams.toString()}`} />}>
              <Download data-icon="inline-start" />
              Loyers CSV
            </Button>
            <Button variant="outline" render={<a href={`/api/reports/accounting/profitability?${exportParams.toString()}`} />}>
              <Download data-icon="inline-start" />
              Rentabilité CSV
            </Button>
            <Button variant="outline" render={<a href={`/api/reports/accounting/fees?${exportParams.toString()}`} />}>
              <Download data-icon="inline-start" />
              Honoraires CSV
            </Button>
            <Button variant="outline" render={<a href={`/api/reports/accounting/income-expense?${exportParams.toString()}`} />}>
              <Download data-icon="inline-start" />
              Revenus/Dépenses CSV
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Immeuble</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Encaissé</TableHead>
                <TableHead className="text-right">Autres revenus</TableHead>
                <TableHead className="text-right">Dépenses</TableHead>
                <TableHead className="text-right">Frais gestion</TableHead>
                <TableHead className="text-right">Dû au propriétaire</TableHead>
                <TableHead className="text-right">Versé</TableHead>
                <TableHead className="text-right">Reste</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.byBuilding.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="h-24 text-center text-sm text-muted-foreground">
                    Aucun immeuble dans votre périmètre.
                  </TableCell>
                </TableRow>
              )}
              {data.byBuilding.map((row) => (
                <TableRow key={row.buildingId}>
                  <TableCell className="font-semibold">{row.buildingName}</TableCell>
                  <TableCell>
                    <Badge variant={row.ownerKind === "third_party" ? "secondary" : "outline"}>
                      {row.ownerKind === "third_party" ? "Géré" : "Propre"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">{formatFcfa(row.rentCollected)}</TableCell>
                  <TableCell className="text-right">{formatFcfa(row.otherIncome)}</TableCell>
                  <TableCell className="text-right text-destructive">
                    {formatFcfa(row.expensesOwner + row.expensesAgency)}
                  </TableCell>
                  <TableCell className="text-right">{formatFcfa(row.managementFee)}</TableCell>
                  <TableCell className="text-right font-semibold">{formatFcfa(row.ownerPayable)}</TableCell>
                  <TableCell className="text-right">{formatFcfa(row.remitted)}</TableCell>
                  <TableCell className={row.remaining > 0 ? "text-right font-bold text-destructive" : "text-right font-bold"}>
                    {formatFcfa(row.remaining)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Détail par appartement</CardTitle>
          <CardDescription>Loyers et charges imputés unité par unité sur {period}. Dépliez un immeuble.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {data.byBuilding.length === 0 && <p className="text-sm text-muted-foreground">Aucune unité à afficher.</p>}
          {data.byBuilding.map((row) => (
            <details key={row.buildingId} className="rounded-lg border border-border">
              <summary className="flex cursor-pointer items-center justify-between gap-3 px-4 py-3 text-sm font-semibold">
                <span>{row.buildingName}</span>
                <span className="text-xs font-normal text-muted-foreground">
                  {row.apartments.length} unité{row.apartments.length > 1 ? "s" : ""} · {formatFcfa(row.rentCollected)} encaissés
                </span>
              </summary>
              <div className="border-t border-border px-4 py-3">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Unité</TableHead>
                      <TableHead className="text-right">Loyers facturés</TableHead>
                      <TableHead className="text-right">Loyers encaissés</TableHead>
                      <TableHead className="text-right">Impayés</TableHead>
                      <TableHead className="text-right">Dépenses</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {row.apartments.map((apartment) => (
                      <TableRow key={apartment.apartmentId ?? "unattributed"}>
                        <TableCell className="font-medium">{apartment.unitNumber}</TableCell>
                        <TableCell className="text-right">{formatFcfa(apartment.rentBilled)}</TableCell>
                        <TableCell className="text-right">{formatFcfa(apartment.rentCollected)}</TableCell>
                        <TableCell className={apartment.rentBilled - apartment.rentCollected > 0 ? "text-right text-destructive" : "text-right"}>
                          {formatFcfa(apartment.rentBilled - apartment.rentCollected)}
                        </TableCell>
                        <TableCell className="text-right text-destructive">{formatFcfa(apartment.expenses)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </details>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
