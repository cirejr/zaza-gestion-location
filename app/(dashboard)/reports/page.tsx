import Link from "next/link";
import { Download, FileText, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/dashboard/page-header";
import { serverApiFetch } from "@/lib/server-api";
import type { ApiReport } from "@/lib/dashboard-types";
import { formatCfa } from "@/lib/dashboard-utils";

export default async function ReportsPage() {
  const period = new Date().toISOString().slice(0, 7);
  const report = await serverApiFetch<{ data: ApiReport }>(`/api/reports/summary?period=${period}`);
  const data = report.data;
  return <div className="flex flex-col gap-6"><PageHeader eyebrow="Vision de propriétaire" title="Rapports" description="Un aperçu clair de vos encaissements, charges et charges d’occupation." action={<Button render={<a href={`/api/reports/export.csv?period=${data.period}`} />} variant="outline"><Download data-icon="inline-start" />Exporter CSV</Button>} /><Card><CardHeader><CardTitle>Synthèse financière</CardTitle><CardDescription>Période {data.period}</CardDescription></CardHeader><CardContent className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Metric label="Revenus" value={formatCfa(data.collected)} /><Metric label="Charges" value={formatCfa(data.charges)} /><Metric label="Solde net" value={formatCfa(data.net)} /><Metric label="Occupation" value={`${data.occupancyRate}%`} /></CardContent></Card><Card><CardHeader><CardTitle>Accès propriétaire</CardTitle><CardDescription>Le même espace fonctionne à distance, sans token public.</CardDescription></CardHeader><CardContent className="flex items-center gap-3"><span className="flex size-10 items-center justify-center rounded-full bg-secondary text-secondary-foreground"><ShieldCheck /></span><div><p className="text-sm font-semibold">Données synchronisées avec le backend</p><p className="text-xs text-muted-foreground">Les propriétaires voient les mêmes immeubles et les mêmes indicateurs que les gérants.</p></div></CardContent></Card><div className="grid gap-4 sm:grid-cols-2"><Card><CardHeader><CardTitle>Export PDF</CardTitle><CardDescription>Synthèse propriétaire du mois.</CardDescription></CardHeader><CardContent><Button render={<a href={`/api/reports/export.pdf?period=${data.period}`} />} variant="outline" className="w-full"><FileText data-icon="inline-start" />Télécharger le PDF</Button></CardContent></Card><Card><CardHeader><CardTitle>Prochaine étape</CardTitle><CardDescription>Connectez vos intégration preferred.</CardDescription></CardHeader><CardContent><Button render={<Link href="/settings" />} variant="ghost" className="w-full">Configurer les intégrations</Button></CardContent></Card></div></div>;
}

function Metric({ label, value }: { label: string; value: string }) { return <div className="rounded-xl bg-muted p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-2 text-lg font-black tracking-tight">{value}</p></div>; }
