"use client";

import {
  Bell,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  Clock,
  Copy,
  Handshake,
  MapPin,
  MessageCircle,
  Pencil,
  PhoneCall,
  Plus,
  RefreshCw,
  RotateCcw,
  StickyNote,
  UserSearch,
  Wand2,
  X,
  XCircle,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { toast } from "sonner";
import { ApiError, apiFetch } from "@/lib/api";
import type {
  ApiBuildingOverview,
  ApiProspectActivity,
  ApiProspectDetail,
  ApiProspectMatch,
  ApiProspectReservation,
  ApiProspectVisit,
} from "@/lib/dashboard-types";
import { formatCfa, formatDate, initials } from "@/lib/dashboard-utils";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { RowAction } from "@/components/dashboard/row-action";
import { CreateDialog, type DialogField, type SelectOption } from "@/components/dashboard/create-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Empty, EmptyContent, EmptyDescription, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";

const propertyTypeOptions: SelectOption[] = [
  { value: "studio", label: "Studio" },
  { value: "chambre", label: "Chambre" },
  { value: "apartment", label: "Appartement" },
  { value: "house", label: "Maison" },
  { value: "commercial", label: "Local commercial" },
  { value: "other", label: "Autre" },
];

function propertyTypeLabel(value: string | null | undefined) {
  return propertyTypeOptions.find((option) => option.value === value)?.label ?? "—";
}

const statusOptions: SelectOption[] = [
  { value: "new", label: "Nouveau" },
  { value: "contacted", label: "Contacté" },
  { value: "notified", label: "Notifié" },
  { value: "visit_scheduled", label: "Visite prévue" },
  { value: "visited", label: "Visité" },
  { value: "negotiation", label: "Négociation" },
  { value: "lost", label: "Perdu" },
];

const activityLabels: Record<string, string> = {
  created: "Prospect enregistré",
  status_change: "Changement de statut",
  contact: "Contact",
  note: "Note",
  notified: "Notifié d’un logement",
  visit_scheduled: "Visite planifiée",
  visit_completed: "Visite effectuée",
  visit_cancelled: "Visite annulée",
  visit_missed: "Visite manquée",
  converted: "Conversion en locataire",
  lost: "Perdu",
  other: "Autre",
};

const activityIcons: Record<string, React.ElementType> = {
  created: Plus,
  status_change: RefreshCw,
  contact: PhoneCall,
  note: StickyNote,
  notified: Bell,
  visit_scheduled: CalendarClock,
  visit_completed: CheckCircle2,
  visit_cancelled: X,
  visit_missed: Clock,
  converted: Handshake,
  lost: XCircle,
  other: ClipboardList,
};

function waDigits(phone: string) {
  const digits = phone.replace(/\D/g, "").replace(/^00/, "");
  return digits || phone.replace(/[^a-zA-Z0-9]/g, "");
}

function InfoRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
      <span className="text-sm">{value ?? "—"}</span>
    </div>
  );
}

export function ProspectWorkspace({
  id,
  initial,
  matches,
  buildings,
}: {
  id: string;
  initial: ApiProspectDetail;
  matches: ApiProspectMatch[];
  buildings: ApiBuildingOverview[];
}) {
  const router = useRouter();
  const [prospect, setProspect] = useState<ApiProspectDetail>(initial);
  const [visitOpen, setVisitOpen] = useState(false);
  const [visitApartment, setVisitApartment] = useState<string | null>(null);
  const [reserveOpen, setReserveOpen] = useState(false);
  const [reserveApartment, setReserveApartment] = useState<string | null>(null);
  const [convertOpen, setConvertOpen] = useState(false);
  const [convertApartment, setConvertApartment] = useState<string | null>(null);
  const [statusBusy, setStatusBusy] = useState(false);

  const converted = prospect.convertedTenantId != null;

  const apartmentIndex = useMemo(() => {
    const rows = buildings.flatMap((building) =>
      building.apartments.map((apartment) => ({
        apartment,
        building,
        label: `${building.name} · ${apartment.unitNumber} — ${formatCfa(apartment.rentAmount)}`,
      })),
    );
    const byId = new Map(rows.map((row) => [row.apartment.id, row]));
    return { rows, byId, options: rows.map((row) => ({ value: row.apartment.id, label: row.label })) };
  }, [buildings]);

  function apartmentLabel(apartmentId: string | null | undefined) {
    if (!apartmentId) return "—";
    return apartmentIndex.byId.get(apartmentId)?.label.replace(/\s*—.*$/, "") ?? "—";
  }

  async function reload() {
    const result = await apiFetch<{ data: ApiProspectDetail }>(`/api/prospects/${id}`);
    setProspect(result.data);
  }

  async function handleError(requestError: unknown) {
    const message =
      requestError instanceof ApiError
        ? requestError.message
        : requestError instanceof Error
          ? requestError.message
          : "Une erreur est survenue. Réessayez.";
    toast.error(message);
  }

  async function changeStatus(next: string) {
    if (next === prospect.status) return;
    setStatusBusy(true);
    if (next === "lost" && !window.confirm("Marquer ce prospect comme perdu ?")) {
      setStatusBusy(false);
      return;
    }
    try {
      await apiFetch(`/api/prospects/${id}/status`, { method: "POST", body: JSON.stringify({ status: next }) });
      toast.success("Statut mis à jour.");
      await reload();
    } catch (requestError) {
      await handleError(requestError);
    } finally {
      setStatusBusy(false);
    }
  }

  async function copyPhone() {
    try {
      await navigator.clipboard.writeText(prospect.phone);
      toast.success("Numéro copié.");
    } catch {
      toast.error("Impossible de copier le numéro.");
    }
  }

  async function copyRequirements() {
    const budget =
      prospect.budgetMin == null && prospect.budgetMax == null
        ? ""
        : `Budget : ${prospect.budgetMin != null ? formatCfa(prospect.budgetMin) : "—"} – ${prospect.budgetMax != null ? formatCfa(prospect.budgetMax) : "—"}`;
    const summary = [
      `Prospect : ${prospect.fullName}`,
      `Téléphone : ${prospect.phone}`,
      prospect.whatsappNumber ? `WhatsApp : ${prospect.whatsappNumber}` : "",
      prospect.email ? `Email : ${prospect.email}` : "",
      `Type recherché : ${propertyTypeLabel(prospect.propertyType)}`,
      prospect.location ? `Secteur : ${prospect.location}` : "",
      budget,
      prospect.bedrooms != null ? `Chambres : ${prospect.bedrooms}` : "",
      prospect.furnished != null ? `Meublé : ${prospect.furnished ? "Oui" : "Non"}` : "",
      prospect.moveInDate ? `Emménagement : ${formatDate(prospect.moveInDate)}` : "",
      (prospect.amenities ?? []).length > 0 ? `Commodités : ${(prospect.amenities ?? []).join(", ")}` : "",
      prospect.requirements ? `Besoin exprimé : ${prospect.requirements}` : "",
    ]
      .filter(Boolean)
      .join("\n");
    try {
      await navigator.clipboard.writeText(summary);
      toast.success("Résumé de la recherche copié.");
    } catch {
      toast.error("Impossible de copier le résumé.");
    }
  }

  const editFields: DialogField[] = [
    { type: "text", name: "fullName", label: "Nom complet", required: true },
    { type: "text", name: "phone", label: "Téléphone", required: true },
    { type: "text", name: "whatsappNumber", label: "WhatsApp" },
    { type: "text", name: "email", label: "Email" },
    { type: "text", name: "preferredContact", label: "Canal de contact préféré" },
    { type: "select", name: "propertyType", label: "Type recherché", options: propertyTypeOptions, placeholder: "Tous les types" },
    { type: "text", name: "location", label: "Secteur souhaité" },
    { type: "amount", name: "budgetMin", label: "Budget min. (FCFA)", min: 0 },
    { type: "amount", name: "budgetMax", label: "Budget max. (FCFA)", min: 0 },
    { type: "number", name: "bedrooms", label: "Chambres", min: 0 },
    { type: "select", name: "furnished", label: "Meublé", options: [{ value: "true", label: "Oui" }, { value: "false", label: "Non" }] },
    { type: "date", name: "moveInDate", label: "Emménagement souhaité" },
    { type: "text", name: "amenities", label: "Commodités (séparées par des virgules)" },
    { type: "text", name: "requirements", label: "Besoin exprimé" },
    { type: "text", name: "notes", label: "Notes internes" },
  ];

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <Card>
        <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="flex size-11 items-center justify-center rounded-xl bg-secondary text-lg font-black text-secondary-foreground">
              {initials(prospect.fullName)}
            </span>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-xl font-black tracking-tight">{prospect.fullName}</h2>
                <StatusBadge status={prospect.status} />
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {prospect.phone}
                {prospect.location ? ` · ${prospect.location}` : ""}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Enregistré {formatDate(prospect.createdAt)}
                {prospect.creator ? ` par ${prospect.creator.name}` : ""}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {!converted && (
              <Select value={prospect.status} onValueChange={(value) => void changeStatus(value ?? prospect.status)} items={statusOptions}>
                <SelectTrigger disabled={statusBusy}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {statusOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            )}
            <Button variant="outline" size="sm" render={<a href={`tel:${prospect.phone.replace(/[^+0-9]/g, "")}`} />}>
              <PhoneCall data-icon="inline-start" />
              Appeler
            </Button>
            <Button variant="outline" size="sm" render={<a href={`https://wa.me/${waDigits(prospect.whatsappNumber ?? prospect.phone)}`} target="_blank" rel="noreferrer" />}>
              <MessageCircle data-icon="inline-start" />
              WhatsApp
            </Button>
            <Button variant="outline" size="sm" onClick={() => void copyPhone()}>
              <Copy data-icon="inline-start" />
              Copier
            </Button>
            <Button variant="outline" size="sm" onClick={() => void copyRequirements()}>
              <ClipboardList data-icon="inline-start" />
              Copier le résumé
            </Button>
            <CreateDialog
              trigger={<Button variant="outline" size="sm"><Pencil data-icon="inline-start" />Modifier</Button>}
              title="Modifier le prospect"
              description="Mettez à jour les informations de contact et les critères de recherche."
              fields={editFields}
              endpoint={`/api/prospects/${id}`}
              method="PATCH"
              successMessage="Prospect mis à jour."
              defaults={{
                fullName: prospect.fullName,
                phone: prospect.phone,
                whatsappNumber: prospect.whatsappNumber ?? "",
                email: prospect.email ?? "",
                preferredContact: prospect.preferredContact ?? "",
                propertyType: prospect.propertyType ?? "",
                location: prospect.location ?? "",
                budgetMin: prospect.budgetMin ?? "",
                budgetMax: prospect.budgetMax ?? "",
                bedrooms: prospect.bedrooms?.toString() ?? "",
                furnished: prospect.furnished == null ? "" : String(prospect.furnished),
                moveInDate: prospect.moveInDate ?? "",
                amenities: (prospect.amenities ?? []).join(", "),
                requirements: prospect.requirements ?? "",
                notes: prospect.notes ?? "",
              }}
              transform={(payload) => {
                if (typeof payload.amenities === "string") {
                  const cleaned = payload.amenities.split(",").map((item) => item.trim()).filter(Boolean);
                  payload.amenities = cleaned;
                }
                return payload;
              }}
            />
            {!converted && (
              <RowAction
                endpoint={`/api/prospects/${id}`}
                method="DELETE"
                label="Supprimer le prospect"
                icon="trash"
                confirm
                confirmTitle="Supprimer définitivement ce prospect ?"
                successMessage="Prospect supprimé."
              />
            )}
          </div>
        </CardContent>
      </Card>

      {converted && (
        <Card className="border-emerald-300 bg-emerald-50/60 dark:border-emerald-700/40 dark:bg-emerald-950/30">
          <CardContent className="flex flex-wrap items-center gap-2 p-4 text-sm">
            <Handshake className="size-4 text-emerald-600" />
            <span className="font-semibold">Converti en locataire.</span>
            <Button variant="link" size="sm" render={<a href="/tenants" />}>Voir les locataires</Button>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Demande */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Demande</CardTitle>
            <CardDescription>Critères de recherche du prospect.</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-x-4 gap-y-4">
            <InfoRow label="Type" value={propertyTypeOptions.find((option) => option.value === prospect.propertyType)?.label ?? "—"} />
            <InfoRow label="Secteur" value={prospect.location ?? "—"} />
            <InfoRow label="Budget" value={
              prospect.budgetMin == null && prospect.budgetMax == null
                ? "—"
                : prospect.budgetMin == null
                  ? `≤ ${formatCfa(prospect.budgetMax!)}`
                  : prospect.budgetMax == null
                    ? `≥ ${formatCfa(prospect.budgetMin)}`
                    : `${formatCfa(prospect.budgetMin)} – ${formatCfa(prospect.budgetMax)}`
            } />
            <InfoRow label="Chambres" value={prospect.bedrooms == null ? "—" : String(prospect.bedrooms)} />
            <InfoRow label="Meublé" value={prospect.furnished == null ? "—" : prospect.furnished ? "Oui" : "Non"} />
            <InfoRow label="Emménagement" value={prospect.moveInDate ? formatDate(prospect.moveInDate) : "—"} />
            {(prospect.email || prospect.whatsappNumber) && (
              <>
                <InfoRow label="Email" value={prospect.email ?? "—"} />
                <InfoRow label="WhatsApp" value={prospect.whatsappNumber ?? "—"} />
              </>
            )}
            {prospect.amenities && prospect.amenities.length > 0 && (
              <div className="col-span-2 flex flex-col gap-1">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Commodités</span>
                <div className="flex flex-wrap gap-1.5">
                  {prospect.amenities.map((amenity) => (
                    <Badge key={amenity} variant="secondary">{amenity}</Badge>
                  ))}
                </div>
              </div>
            )}
            {(prospect.requirements || prospect.notes) && (
              <>
                <Separator className="col-span-2" />
                <div className="col-span-2 flex flex-col gap-2">
                  {prospect.requirements && <p className="text-sm">{prospect.requirements}</p>}
                  {prospect.notes && <p className="text-xs text-muted-foreground">{prospect.notes}</p>}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Activité */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Activité</CardTitle>
              <CardDescription>Contacts, notifications et changements de statut.</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <CreateDialog
                trigger={
                  <Button variant="outline" size="sm">
                    <Plus data-icon="inline-start" />
                    Consigner
                  </Button>
                }
                title="Consigner une activité"
                description="Ajoutez un contact, une note ou une notification au dossier."
                fields={[
                  {
                    type: "select",
                    name: "kind",
                    label: "Type",
                    required: true,
                    options: [
                      { value: "contact", label: "Contact" },
                      { value: "notified", label: "Notifié" },
                      { value: "note", label: "Note" },
                      { value: "other", label: "Autre" },
                    ],
                  },
                  { type: "textarea", name: "note", label: "Note", placeholder: "Compte rendu de l’échange…" },
                ]}
                defaults={{ kind: "contact" }}
                endpoint={`/api/prospects/${prospect.id}/activities`}
                successMessage="Activité consignée."
                submitLabel="Consigner"
              />
              <Button variant="outline" size="sm" onClick={() => void reload()}>
                <RotateCcw data-icon="inline-start" />
                Actualiser
              </Button>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col">
            {prospect.activities.length === 0 ? (
              <Empty>
                <EmptyMedia variant="icon"><UserSearch /></EmptyMedia>
                <EmptyContent>
                  <EmptyTitle>Aucune activité</EmptyTitle>
                  <EmptyDescription>Aucune action n’a encore été enregistrée pour ce prospect.</EmptyDescription>
                </EmptyContent>
              </Empty>
            ) : (
              <ol className="flex flex-col">
                {prospect.activities.map((activity, index) => {
                  const Icon = activityIcons[activity.kind] ?? ClipboardList;
                  return (
                    <li key={activity.id} className="relative flex gap-3 pb-5 last:pb-0">
                      {index < prospect.activities.length - 1 && <span className="absolute left-4 top-9 bottom-0 w-px bg-border" aria-hidden />}
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
                        <Icon className="size-4" />
                      </span>
                      <div className="min-w-0 pt-1">
                        <div className="flex flex-wrap items-baseline gap-x-2">
                          <span className="text-sm font-semibold">{activityLabels[activity.kind] ?? activity.kind}</span>
                          <span className="text-xs text-muted-foreground">{formatDate(activity.createdAt)}</span>
                        </div>
                        {activity.note && <p className="mt-0.5 text-sm text-muted-foreground">{activity.note}</p>}
                        {activity.fromStatus && activity.toStatus && (
                          <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                            <StatusBadge status={activity.fromStatus} />
                            <span>→</span>
                            <StatusBadge status={activity.toStatus} />
                          </div>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </CardContent>
        </Card>
      </div>

      {!converted && (
        <Card>
          <CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center">
            <div className="flex-1">
              <p className="text-sm font-semibold">Faire avancer le dossier</p>
              <p className="text-xs text-muted-foreground">Planifiez une visite, réservez un logement ou convertissez ce prospect en locataire.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => { setVisitApartment(null); setVisitOpen(true); }}>
                <CalendarClock data-icon="inline-start" />
                Planifier une visite
              </Button>
              <Button variant="outline" onClick={() => { setReserveApartment(null); setReserveOpen(true); }}>
                <MapPin data-icon="inline-start" />
                Réserver
              </Button>
              <Button onClick={() => { setConvertApartment(null); setConvertOpen(true); }}>
                <Wand2 data-icon="inline-start" />
                Convertir en locataire
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Visites */}
        <Card>
          <CardHeader>
            <CardTitle>Visites</CardTitle>
            <CardDescription>Historique des visites planifiées et effectuées.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col">
            {prospect.visits.length === 0 ? (
              <Empty>
                <EmptyMedia variant="icon"><CalendarClock /></EmptyMedia>
                <EmptyContent>
                  <EmptyTitle>Aucune visite</EmptyTitle>
                  <EmptyDescription>Planifiez une visite pour que le prospect découvre un appartement.</EmptyDescription>
                </EmptyContent>
              </Empty>
            ) : (
              <ul className="flex flex-col gap-2">
                {prospect.visits.map((visit) => (
                  <li key={visit.id} className="flex flex-col gap-2 rounded-xl border border-border p-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold">{apartmentLabel(visit.apartmentId)}</span>
                        <StatusBadge status={visit.status} />
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">{formatDate(visit.scheduledAt)}</p>
                      {visit.notes && <p className="mt-1 text-xs text-muted-foreground">{visit.notes}</p>}
                      {visit.outcome && <p className="mt-0.5 text-xs">{visit.outcome}</p>}
                    </div>
                    {visit.status === "scheduled" && (
                      <div className="flex shrink-0 items-center gap-1">
                        <RowAction
                          endpoint={`/api/prospects/visits/${visit.id}`}
                          method="PATCH"
                          body={{ status: "completed" }}
                          label="Marquer effectuée"
                          icon="check"
                          variant="outline"
                          size="sm"
                          successMessage="Visite marquée comme effectuée."
                        />
                        <RowAction
                          endpoint={`/api/prospects/visits/${visit.id}`}
                          method="PATCH"
                          body={{ status: "cancelled" }}
                          label="Annuler la visite"
                          icon="x"
                          variant="outline"
                          size="sm"
                          confirm
                          confirmTitle="Annuler cette visite ?"
                          successMessage="Visite annulée."
                        />
                      </div>
                    )}
                    {(visit.status === "cancelled" || visit.status === "missed") && (
                      <RowAction
                        endpoint={`/api/prospects/visits/${visit.id}`}
                        method="PATCH"
                        body={{ status: "scheduled" }}
                        label="Reprogrammer"
                        icon="retry"
                        variant="outline"
                        size="sm"
                        successMessage="Visite reprogrammée."
                      />
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Réservations */}
        <Card>
          <CardHeader>
            <CardTitle>Réservations</CardTitle>
            <CardDescription>Blocages de disponibilité pour ce prospect.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col">
            {prospect.reservations.length === 0 ? (
              <Empty>
                <EmptyMedia variant="icon"><MapPin /></EmptyMedia>
                <EmptyContent>
                  <EmptyTitle>Aucune réservation</EmptyTitle>
                  <EmptyDescription>Réservez un logement pour le blocage de la disponibilité.</EmptyDescription>
                </EmptyContent>
              </Empty>
            ) : (
              <ul className="flex flex-col gap-2">
                {prospect.reservations.map((reservation) => (
                  <li key={reservation.id} className="flex flex-col gap-2 rounded-xl border border-border p-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold">{apartmentLabel(reservation.apartmentId)}</span>
                        <StatusBadge status={reservation.status} />
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {formatDate(reservation.startDate)} → {formatDate(reservation.endDate)}
                        {reservation.notes ? ` · ${reservation.notes}` : ""}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      {reservation.status === "tentative" && (
                        <RowAction
                          endpoint={`/api/prospects/reservations/${reservation.id}`}
                          method="PATCH"
                          body={{ status: "confirmed" }}
                          label="Confirmer"
                          icon="check"
                          variant="outline"
                          size="sm"
                          successMessage="Réservation confirmée."
                        />
                      )}
                      <RowAction
                        endpoint={`/api/prospects/reservations/${reservation.id}`}
                        method="DELETE"
                        label="Supprimer la réservation"
                        icon="trash"
                        size="sm"
                        confirm
                        confirmTitle="Supprimer cette réservation ?"
                        successMessage="Réservation supprimée."
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Correspondances */}
      <Card>
        <CardHeader>
          <CardTitle>Appartements correspondants</CardTitle>
          <CardDescription>Correspondance pondérée à partir de la demande du prospect. Les préférences ne sont pas des contraintes rigides.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {matches.length === 0 ? (
            <Empty>
              <EmptyMedia variant="icon"><MapPin /></EmptyMedia>
              <EmptyContent>
                <EmptyTitle>Aucun appartement</EmptyTitle>
                <EmptyDescription>Ajoutez des immeubles pour obtenir des correspondances.</EmptyDescription>
              </EmptyContent>
            </Empty>
          ) : (
            matches.map((match) => (
              <div key={match.apartment.id} className="flex flex-col gap-3 rounded-xl border border-border p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold">{match.building.name} · {match.apartment.unitNumber}</span>
                    {match.availableNow ? (
                      <Badge>Disponible maintenant</Badge>
                    ) : match.availableAtMoveIn ? (
                      <Badge variant="secondary">Disponible à la date d’emménagement</Badge>
                    ) : (
                      <Badge variant="destructive">Occupé aux dates souhaitées</Badge>
                    )}
                    <Badge variant="outline">Score {match.score}/100</Badge>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {formatCfa(match.apartment.rentAmount)} · {match.building.city ?? match.building.address}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {match.reasons.map((reason) => (
                      <Badge key={reason} variant="secondary"><CheckCircle2 data-icon="inline-start" className="text-emerald-600" />{reason}</Badge>
                    ))}
                    {match.issues.map((issue) => (
                      <Badge key={issue} variant="outline"><XCircle data-icon="inline-start" className="text-muted-foreground" />{issue}</Badge>
                    ))}
                  </div>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                  <Button variant="outline" size="sm" disabled={converted} onClick={() => { setVisitApartment(match.apartment.id); setVisitOpen(true); }}>
                    <CalendarClock data-icon="inline-start" />
                    Visite
                  </Button>
                  <Button size="sm" disabled={converted} onClick={() => { setConvertApartment(match.apartment.id); setConvertOpen(true); }}>
                    <Wand2 data-icon="inline-start" />
                    Convertir
                  </Button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <VisitDialog
        open={visitOpen}
        onOpenChange={setVisitOpen}
        prospectId={id}
        apartmentId={visitApartment}
        apartmentOptions={apartmentIndex.options}
        onDone={() => void reload()}
      />
      <ReservationDialog
        open={reserveOpen}
        onOpenChange={setReserveOpen}
        prospectId={id}
        apartmentId={reserveApartment}
        apartmentOptions={apartmentIndex.options}
        onDone={() => void reload()}
      />
      <ConvertDialog
        open={convertOpen}
        onOpenChange={setConvertOpen}
        prospectId={id}
        prospect={prospect}
        apartmentId={convertApartment}
        apartmentOptions={apartmentIndex.options}
        matches={matches}
        onDone={async () => {
          await reload();
          toast.success("Prospect converti en locataire.");
          router.refresh();
        }}
      />
    </div>
  );
}

function VisitDialog({
  open,
  onOpenChange,
  prospectId,
  apartmentId,
  apartmentOptions,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prospectId: string;
  apartmentId: string | null;
  apartmentOptions: SelectOption[];
  onDone: () => void;
}) {
  const [apartment, setApartment] = useState(apartmentId ?? "");
  const [scheduledAt, setScheduledAt] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleOpenChange(next: boolean) {
    onOpenChange(next);
    if (next) {
      setApartment(apartmentId ?? "");
      setNotes("");
      setError(null);
      const nextHour = new Date(Date.now() + 60 * 60 * 1000);
      const offset = nextHour.getTimezoneOffset();
      setScheduledAt(new Date(nextHour.getTime() - offset * 60 * 1000).toISOString().slice(0, 16));
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await apiFetch(`/api/prospects/${prospectId}/visits`, {
        method: "POST",
        body: JSON.stringify({ apartmentId: apartment || null, scheduledAt, notes: notes || null }),
      });
      toast.success("Visite planifiée.");
      onOpenChange(false);
      onDone();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Une erreur est survenue.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Planifier une visite</DialogTitle>
          <DialogDescription>Choisissez l’appartement et la date de la visite.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <div className="grid gap-4">
            <Field>
              <FieldLabel>Appartement</FieldLabel>
              <Select value={apartment} onValueChange={(value) => setApartment(value ?? "")} items={apartmentOptions}>
                <SelectTrigger>
                  <SelectValue placeholder="Choisir un appartement" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {apartmentOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel>Date et heure</FieldLabel>
              <Input type="datetime-local" required value={scheduledAt} onChange={(event) => setScheduledAt(event.target.value)} />
            </Field>
            <Field>
              <FieldLabel>Notes</FieldLabel>
              <Input value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Note préparatoire pour la visite…" />
            </Field>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="submit" disabled={loading}>
              {loading ? <><Spinner data-icon="inline-start" />Enregistrement…</> : "Planifier"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ReservationDialog({
  open,
  onOpenChange,
  prospectId,
  apartmentId,
  apartmentOptions,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prospectId: string;
  apartmentId: string | null;
  apartmentOptions: SelectOption[];
  onDone: () => void;
}) {
  const [apartment, setApartment] = useState(apartmentId ?? "");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [status, setStatus] = useState("tentative");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleOpenChange(next: boolean) {
    onOpenChange(next);
    if (next) {
      setApartment(apartmentId ?? "");
      setStatus("tentative");
      setNotes("");
      setError(null);
      const today = new Date().toISOString().slice(0, 10);
      setStartDate(today);
      setEndDate(today);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (endDate < startDate) {
      setError("La date de fin doit être postérieure au début.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await apiFetch(`/api/prospects/${prospectId}/reservations`, {
        method: "POST",
        body: JSON.stringify({ apartmentId: apartment || null, startDate, endDate, status, notes: notes || null }),
      });
      toast.success("Réservation enregistrée.");
      onOpenChange(false);
      onDone();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Une erreur est survenue.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Réserver un logement</DialogTitle>
          <DialogDescription>Bloquez la disponibilité d’un appartement sur une période.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <div className="grid gap-4">
            <Field>
              <FieldLabel>Appartement</FieldLabel>
              <Select value={apartment} onValueChange={(value) => setApartment(value ?? "")} items={apartmentOptions}>
                <SelectTrigger>
                  <SelectValue placeholder="Choisir un appartement" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {apartmentOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field>
                <FieldLabel>Début</FieldLabel>
                <Input type="date" required value={startDate} onChange={(event) => setStartDate(event.target.value)} />
              </Field>
              <Field>
                <FieldLabel>Fin</FieldLabel>
                <Input type="date" required value={endDate} onChange={(event) => setEndDate(event.target.value)} />
              </Field>
            </div>
            <Field>
              <FieldLabel>Type de blocage</FieldLabel>
              <Select value={status} onValueChange={(value) => setStatus(value ?? "tentative")} items={[{ value: "tentative", label: "Tentatif (conseil)" }, { value: "confirmed", label: "Confirmé (bloque)" }]}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="tentative">Tentatif (conseil)</SelectItem>
                    <SelectItem value="confirmed">Confirmé (bloque)</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel>Notes</FieldLabel>
              <Input value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Conditions de la réservation…" />
            </Field>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="submit" disabled={loading}>
              {loading ? <><Spinner data-icon="inline-start" />Enregistrement…</> : "Réserver"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ConvertDialog({
  open,
  onOpenChange,
  prospectId,
  prospect,
  apartmentId,
  apartmentOptions,
  matches,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prospectId: string;
  prospect: ApiProspectDetail;
  apartmentId: string | null;
  apartmentOptions: SelectOption[];
  matches: ApiProspectMatch[];
  onDone: () => Promise<void>;
}) {
  const [apartment, setApartment] = useState(apartmentId ?? "");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [rentAmount, setRentAmount] = useState("");
  const [depositAmount, setDepositAmount] = useState("0");
  const [fullName, setFullName] = useState(prospect.fullName);
  const [phone, setPhone] = useState(prospect.phone);
  const [whatsappNumber, setWhatsappNumber] = useState(prospect.whatsappNumber ?? "");
  const [rentTouched, setRentTouched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [blockers, setBlockers] = useState<Array<{ type: string; label: string }>>([]);
  const selectedMatch = apartment ? matches.find((match) => match.apartment.id === apartment) ?? null : null;

  function handleOpenChange(next: boolean) {
    onOpenChange(next);
    if (next) {
      setApartment(apartmentId ?? "");
      setStartDate(new Date().toISOString().slice(0, 10));
      setEndDate("");
      setDepositAmount("0");
      setFullName(prospect.fullName);
      setPhone(prospect.phone);
      setWhatsappNumber(prospect.whatsappNumber ?? "");
      setRentTouched(false);
      setError(null);
      setBlockers([]);
      const preset = apartmentOptions.find((option) => option.value === apartmentId);
      setRentAmount(preset ? preset.label.split("—").pop()?.trim().replace(/\D/g, "") ?? "" : "");
    }
  }

  function selectApartment(value: string) {
    setApartment(value);
    if (!rentTouched) {
      const preset = apartmentOptions.find((option) => option.value === value);
      const digits = preset ? preset.label.split("—").pop()?.trim().replace(/\D/g, "") ?? "" : "";
      setRentAmount(digits);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (endDate && endDate < startDate) {
      setError("La date de fin doit être postérieure au début.");
      return;
    }
    setError(null);
    setBlockers([]);
    setLoading(true);
    try {
      await apiFetch(`/api/prospects/${prospectId}/convert`, {
        method: "POST",
        body: JSON.stringify({
          apartmentId: apartment,
          startDate,
          endDate: endDate || null,
          rentAmount: Number(rentAmount),
          depositAmount: depositAmount ? Number(depositAmount) : 0,
          fullName,
          phone,
          whatsappNumber: whatsappNumber || null,
        }),
      });
      onOpenChange(false);
      await onDone();
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.status === 409) {
        const found = (requestError.details as { data?: { blockers?: Array<{ type: string; label: string }> } } | undefined)?.data?.blockers;
        if (found && found.length > 0) {
          setBlockers(found);
          setError("Cet appartement n’est pas disponible à cette date.");
          return;
        }
      }
      setError(requestError instanceof Error ? requestError.message : "Une erreur est survenue.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Convertir en locataire</DialogTitle>
          <DialogDescription>Crée le locataire et le bail dans une seule transaction. Les conflits de dates sont vérifiés.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <div className="grid gap-4">
            <Field>
              <FieldLabel>Appartement</FieldLabel>
              <Select value={apartment} onValueChange={(value) => selectApartment(value ?? "")} items={apartmentOptions}>
                <SelectTrigger>
                  <SelectValue placeholder="Choisir un appartement" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {apartmentOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            {selectedMatch && (
              <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/30 p-3 text-xs">
                <span className="font-semibold">Occupation actuelle :</span>
                {selectedMatch.availableNow ? (
                  <Badge variant="secondary">Disponible maintenant</Badge>
                ) : selectedMatch.availableAtMoveIn ? (
                  <Badge variant="secondary">Libre à la date d’emménagement souhaitée</Badge>
                ) : (
                  <Badge variant="destructive">Occupé aux dates souhaitées</Badge>
                )}
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <Field>
                <FieldLabel>Début du bail</FieldLabel>
                <Input type="date" required value={startDate} onChange={(event) => setStartDate(event.target.value)} />
              </Field>
              <Field>
                <FieldLabel>Fin du bail (optionnel)</FieldLabel>
                <Input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
              </Field>
            </div>
            <p className="text-xs text-muted-foreground">
              {startDate && startDate <= new Date().toISOString().slice(0, 10)
                ? "Début aujourd’hui ou passé : le bail sera actif et l’appartement marqué occupé immédiatement."
                : "Début futur : le bail sera enregistré en brouillon et l’appartement ne sera marqué occupé qu’à la date d’effet."}
            </p>
            <div className="grid grid-cols-2 gap-4">
              <Field>
                <FieldLabel>Loyer mensuel (FCFA)</FieldLabel>
                <Input type="number" min={1} required value={rentAmount} onChange={(event) => { setRentTouched(true); setRentAmount(event.target.value); }} />
              </Field>
              <Field>
                <FieldLabel>Caution (FCFA)</FieldLabel>
                <Input type="number" min={0} value={depositAmount} onChange={(event) => setDepositAmount(event.target.value)} />
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel>Nom du locataire</FieldLabel>
                <Input required value={fullName} onChange={(event) => setFullName(event.target.value)} />
              </Field>
              <Field>
                <FieldLabel>Téléphone</FieldLabel>
                <Input required value={phone} onChange={(event) => setPhone(event.target.value)} />
              </Field>
            </div>
            <Field>
              <FieldLabel>WhatsApp (optionnel)</FieldLabel>
              <Input value={whatsappNumber} onChange={(event) => setWhatsappNumber(event.target.value)} />
            </Field>
          </div>
          {blockers.length > 0 && (
            <ul className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
              {error && <li className="font-semibold">{error}</li>}
              {blockers.map((blocker) => (
                <li key={`${blocker.type}-${blocker.label}`} className="mt-1">{blocker.label}</li>
              ))}
            </ul>
          )}
          {error && blockers.length === 0 && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="submit" disabled={loading || !apartment}>
              {loading ? <><Spinner data-icon="inline-start" />Conversion…</> : "Convertir en locataire"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}