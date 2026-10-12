"use client";

import { AlertCircle, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { ApiError, apiFetch } from "@/lib/api";
import type { ApiProspect } from "@/lib/dashboard-types";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";

const propertyTypeOptions = [
  { value: "studio", label: "Studio" },
  { value: "chambre", label: "Chambre" },
  { value: "apartment", label: "Appartement" },
  { value: "house", label: "Maison" },
  { value: "commercial", label: "Local commercial" },
  { value: "other", label: "Autre" },
];

type FormState = {
  fullName: string;
  phone: string;
  whatsappNumber: string;
  email: string;
  preferredContact: string;
  propertyType: string;
  location: string;
  budgetMin: string;
  budgetMax: string;
  bedrooms: string;
  furnished: string;
  moveInDate: string;
  amenities: string;
  notes: string;
  requirements: string;
};

const emptyForm: FormState = {
  fullName: "",
  phone: "",
  whatsappNumber: "",
  email: "",
  preferredContact: "",
  propertyType: "",
  location: "",
  budgetMin: "",
  budgetMax: "",
  bedrooms: "",
  furnished: "",
  moveInDate: "",
  amenities: "",
  notes: "",
  requirements: "",
};

function toNullableNumber(value: string) {
  const trimmed = value.trim();
  if (trimmed === "") return undefined;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

export function CreateProspectDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [duplicates, setDuplicates] = useState<ApiProspect[]>([]);
  const [force, setForce] = useState(false);
  const [values, setValues] = useState<FormState>(emptyForm);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setValues(emptyForm);
      setError(null);
      setDuplicates([]);
      setForce(false);
    }
  }

  function setValue(name: keyof FormState, value: string) {
    setValues((current) => ({ ...current, [name]: value }));
  }

  async function submit(overrideForce = force) {
    setError(null);
    setLoading(true);
    const payload: Record<string, unknown> = {
      fullName: values.fullName.trim(),
      phone: values.phone.trim(),
    };
    const whitelist: Array<keyof FormState> = [
      "whatsappNumber",
      "email",
      "preferredContact",
      "location",
      "notes",
      "requirements",
    ];
    for (const key of whitelist) {
      const value = values[key].trim();
      if (value) payload[key] = value;
    }
    const budgetMin = toNullableNumber(values.budgetMin);
    const budgetMax = toNullableNumber(values.budgetMax);
    if (budgetMin !== undefined) payload.budgetMin = budgetMin;
    if (budgetMax !== undefined) payload.budgetMax = budgetMax;
    const bedrooms = toNullableNumber(values.bedrooms);
    if (bedrooms !== undefined) payload.bedrooms = bedrooms;
    if (values.propertyType) payload.propertyType = values.propertyType;
    if (values.furnished) payload.furnished = values.furnished === "true";
    if (values.moveInDate) payload.moveInDate = values.moveInDate;
    const amenities = values.amenities
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    if (amenities.length > 0) payload.amenities = amenities;
    if (overrideForce) payload.force = true;

    try {
      await apiFetch("/api/prospects", { method: "POST", body: JSON.stringify(payload) });
      toast.success("Prospect enregistré.");
      setOpen(false);
      router.refresh();
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.status === 409) {
        const found = (requestError.details as { data?: { duplicates?: ApiProspect[] } } | undefined)?.data?.duplicates ?? [];
        if (found.length > 0) {
          setDuplicates(found);
          setError("Un prospect avec ce numéro existe déjà. Vérifiez les doublons ci-dessous.");
          return;
        }
      }
      setError(requestError instanceof Error ? requestError.message : "Une erreur est survenue.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await submit();
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={<Button />}>
        <Plus data-icon="inline-start" />
        Nouveau prospect
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Nouveau prospect</DialogTitle>
          <DialogDescription>Enregistrez une personne qui cherche un logement. Seuls le nom et le téléphone sont obligatoires.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <FieldGroup>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel>Nom complet *</FieldLabel>
                <Input required value={values.fullName} onChange={(event) => setValue("fullName", event.target.value)} placeholder="Awa Diop" />
              </Field>
              <Field>
                <FieldLabel>Téléphone *</FieldLabel>
                <Input required value={values.phone} onChange={(event) => setValue("phone", event.target.value)} placeholder="+221 78 000 00 00" />
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel>WhatsApp</FieldLabel>
                <Input value={values.whatsappNumber} onChange={(event) => setValue("whatsappNumber", event.target.value)} placeholder="+221 78 000 00 00" />
              </Field>
              <Field>
                <FieldLabel>Email</FieldLabel>
                <Input type="email" value={values.email} onChange={(event) => setValue("email", event.target.value)} placeholder="awa@exemple.sn" />
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel>Type recherché</FieldLabel>
                <Select value={values.propertyType} onValueChange={(value) => setValue("propertyType", value ?? "")} items={propertyTypeOptions}>
                  <SelectTrigger>
                    <SelectValue placeholder="Tous les types" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {propertyTypeOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel>Secteur souhaité</FieldLabel>
                <Input value={values.location} onChange={(event) => setValue("location", event.target.value)} placeholder="Dakar, Almadies…" />
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel>Budget min. (FCFA)</FieldLabel>
                <Input type="number" min={0} value={values.budgetMin} onChange={(event) => setValue("budgetMin", event.target.value)} placeholder="150 000" />
              </Field>
              <Field>
                <FieldLabel>Budget max. (FCFA)</FieldLabel>
                <Input type="number" min={0} value={values.budgetMax} onChange={(event) => setValue("budgetMax", event.target.value)} placeholder="250 000" />
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field>
                <FieldLabel>Chambres</FieldLabel>
                <Input type="number" min={0} value={values.bedrooms} onChange={(event) => setValue("bedrooms", event.target.value)} placeholder="2" />
              </Field>
              <Field>
                <FieldLabel>Meublé</FieldLabel>
                <Select value={values.furnished} onValueChange={(value) => setValue("furnished", value ?? "")} items={[{ value: "true", label: "Oui" }, { value: "false", label: "Non" }]}>
                  <SelectTrigger>
                    <SelectValue placeholder="Indifférent" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="true">Oui</SelectItem>
                      <SelectItem value="false">Non</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel>Emménagement souhaité</FieldLabel>
                <Input type="date" value={values.moveInDate} onChange={(event) => setValue("moveInDate", event.target.value)} />
              </Field>
            </div>
            <Field>
              <FieldLabel>Commodités souhaitées</FieldLabel>
              <Input value={values.amenities} onChange={(event) => setValue("amenities", event.target.value)} placeholder="Climatisation, parking, connexion… (séparées par des virgules)" />
            </Field>
            <Field>
              <FieldLabel>Besoin exprimé</FieldLabel>
              <Input value={values.requirements} onChange={(event) => setValue("requirements", event.target.value)} placeholder="Notes sur la demande du prospect…" />
            </Field>
          </FieldGroup>

          {duplicates.length > 0 && (
            <div className="flex flex-col gap-3">
              <Alert variant="destructive">
                <AlertCircle />
                <AlertTitle>{error}</AlertTitle>
                <AlertDescription>
                  <ul className="mt-2 flex flex-col gap-1">
                    {duplicates.map((duplicate) => (
                      <li key={duplicate.id} className="flex items-center justify-between gap-2 text-sm">
                        <span>
                          <strong>{duplicate.fullName}</strong> · {duplicate.phone} · {duplicate.status}
                        </span>
                      </li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" disabled={loading} onClick={() => setDuplicates([])}>
                  Réviser le doublon
                </Button>
                <Button type="button" disabled={loading} onClick={() => void submit(true)}>
                  {loading ? <Spinner data-icon="inline-start" /> : null}
                  Créer quand même
                </Button>
              </div>
            </div>
          )}

          {error && duplicates.length === 0 && (
            <Alert variant="destructive">
              <AlertCircle />
              <AlertTitle>Impossible d’enregistrer</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <DialogFooter>
            <Button type="submit" disabled={loading || duplicates.length > 0} className="w-full sm:w-auto">
              {loading ? (
                <>
                  <Spinner data-icon="inline-start" />Enregistrement…
                </>
              ) : (
                "Enregistrer le prospect"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}