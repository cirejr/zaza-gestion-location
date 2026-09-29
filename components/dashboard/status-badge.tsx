import { Badge } from "@/components/ui/badge";

const labels: Record<string, string> = { occupied: "Occupé", vacant: "Libre", maintenance: "Travaux", active: "Actif", draft: "Brouillon", expired: "Expiré", terminated: "Terminé", paid: "Payé", pending: "En attente", failed: "Échoué", refunded: "Remboursé", split: "Répartie", notified: "Notifiée", low: "Faible", normal: "Normale", urgent: "Urgente", in_progress: "En cours", resolved: "Résolu", owner: "Propriétaire", manager: "Gérant", tenant: "Locataire" };
const variants: Record<string, "default" | "secondary" | "outline" | "destructive"> = { occupied: "default", active: "default", paid: "default", split: "secondary", notified: "secondary", pending: "outline", draft: "outline", vacant: "outline", maintenance: "outline", expired: "destructive", terminated: "destructive", failed: "destructive", refunded: "destructive", low: "secondary", normal: "outline", urgent: "destructive", in_progress: "secondary", resolved: "default", owner: "default", manager: "secondary", tenant: "outline" };

export function StatusBadge({ status }: { status: string }) {
  return <Badge variant={variants[status] ?? "outline"}>{labels[status] ?? status}</Badge>;
}
