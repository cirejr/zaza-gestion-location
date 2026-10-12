"use client";

import { Building2, ImagePlus, Save, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { ApiError, apiFetch } from "@/lib/api";
import { uploadFile } from "@/components/dashboard/create-dialog";
import type { ApiOrganizationDetail } from "@/lib/dashboard-types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";

const feeBasisOptions = [
  { value: "percent_collected", label: "Pourcentage des loyers encaissés" },
  { value: "percent_due", label: "Pourcentage des loyers facturés" },
  { value: "fixed", label: "Montant fixe par période" },
  { value: "percent_collected_plus_fixed", label: "Pourcentage encaissé + montant fixe" },
];

/** Empty input → null; a number otherwise. */
function toNumber(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

export function OrganizationSettings({ organization, canEdit }: { organization: ApiOrganizationDetail; canEdit: boolean }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [logo, setLogo] = useState(organization.logo ?? "");
  const [form, setForm] = useState({
    name: organization.name,
    slug: organization.slug ?? "",
    contactEmail: organization.contactEmail ?? "",
    contactPhone: organization.contactPhone ?? "",
    address: organization.address ?? "",
    city: organization.city ?? "",
    country: organization.country ?? "Sénégal",
    website: organization.website ?? "",
    description: organization.description ?? "",
    legalName: organization.legalName ?? "",
    registrationNumber: organization.registrationNumber ?? "",
    taxId: organization.taxId ?? "",
    defaultManagementFeeBasis: organization.defaultManagementFeeBasis ?? "",
    defaultFeePercent: organization.defaultFeePercent ?? "",
    defaultFeeAmount: organization.defaultFeeAmount ?? "",
  });

  function update<K extends keyof typeof form>(key: K, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function onPickLogo(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadFile(file, "agency");
      setLogo(url);
      toast.success("Logo téléversé. N’oubliez pas d’enregistrer.");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Téléversement impossible.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    try {
      const body = {
        name: form.name.trim(),
        slug: form.slug.trim() || undefined,
        logo,
        contactEmail: form.contactEmail.trim() || null,
        contactPhone: form.contactPhone.trim() || null,
        address: form.address.trim() || null,
        city: form.city.trim() || null,
        country: form.country.trim() || "Sénégal",
        website: form.website.trim() || null,
        description: form.description.trim() || null,
        legalName: form.legalName.trim() || null,
        registrationNumber: form.registrationNumber.trim() || null,
        taxId: form.taxId.trim() || null,
        defaultManagementFeeBasis: form.defaultManagementFeeBasis || null,
        defaultFeePercent: toNumber(form.defaultFeePercent),
        defaultFeeAmount: toNumber(form.defaultFeeAmount),
      };
      await apiFetch("/api/organization", { method: "PATCH", body: JSON.stringify(body) });
      toast.success("Agence mise à jour.");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Impossible d’enregistrer l’agence.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Identité de l’agence</CardTitle>
          <CardDescription>Le nom, le logo et l’adresse affichés dans l’application et sur les documents.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <div className="flex items-center gap-4">
            <span className="flex size-16 items-center justify-center overflow-hidden rounded-2xl border bg-secondary">
              {logo ? <img src={logo} alt="Logo de l’agence" className="size-full object-cover" /> : <Building2 className="text-muted-foreground" />}
            </span>
            <div className="flex flex-col gap-2">
              <div className="flex gap-2">
                <Button type="button" variant="outline" size="sm" disabled={!canEdit || uploading} onClick={() => fileRef.current?.click()}>
                  {uploading ? <Spinner data-icon="inline-start" /> : <ImagePlus data-icon="inline-start" />}
                  Changer le logo
                </Button>
                {logo && (
                  <Button type="button" variant="ghost" size="sm" disabled={!canEdit} onClick={() => setLogo("")}>
                    <Trash2 data-icon="inline-start" />
                    Retirer
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">PNG ou JPG recommandé, carré. Affiché sur les reçus, contrats et relevés.</p>
            </div>
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(event) => void onPickLogo(event.target.files?.[0])} />
          </div>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="org-name">Nom de l’agence</FieldLabel>
              <Input id="org-name" required disabled={!canEdit} value={form.name} onChange={(event) => update("name", event.target.value)} />
            </Field>
            <Field>
              <FieldLabel htmlFor="org-slug">Adresse (slug)</FieldLabel>
              <Input id="org-slug" disabled={!canEdit} value={form.slug} onChange={(event) => update("slug", event.target.value)} placeholder="agence-diagne" />
              <FieldDescription>Minuscules, chiffres et tirets uniquement. Identifiant unique de l’agence.</FieldDescription>
            </Field>
          </FieldGroup>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Coordonnées</CardTitle>
          <CardDescription>Comment vos clients et locataires vous joignent.</CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="org-email">Email de contact</FieldLabel>
                <Input id="org-email" type="email" disabled={!canEdit} value={form.contactEmail} onChange={(event) => update("contactEmail", event.target.value)} />
              </Field>
              <Field>
                <FieldLabel htmlFor="org-phone">Téléphone</FieldLabel>
                <Input id="org-phone" disabled={!canEdit} value={form.contactPhone} onChange={(event) => update("contactPhone", event.target.value)} placeholder="+221 33 000 00 00" />
              </Field>
            </div>
            <Field>
              <FieldLabel htmlFor="org-address">Adresse</FieldLabel>
              <Input id="org-address" disabled={!canEdit} value={form.address} onChange={(event) => update("address", event.target.value)} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="org-city">Ville</FieldLabel>
                <Input id="org-city" disabled={!canEdit} value={form.city} onChange={(event) => update("city", event.target.value)} />
              </Field>
              <Field>
                <FieldLabel htmlFor="org-country">Pays</FieldLabel>
                <Input id="org-country" disabled={!canEdit} value={form.country} onChange={(event) => update("country", event.target.value)} />
              </Field>
            </div>
            <Field>
              <FieldLabel htmlFor="org-website">Site web</FieldLabel>
              <Input id="org-website" disabled={!canEdit} value={form.website} onChange={(event) => update("website", event.target.value)} placeholder="https://…" />
            </Field>
            <Field>
              <FieldLabel htmlFor="org-description">Présentation</FieldLabel>
              <Input id="org-description" disabled={!canEdit} value={form.description} onChange={(event) => update("description", event.target.value)} />
            </Field>
          </FieldGroup>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Informations légales</CardTitle>
          <CardDescription>Mentions utilisées sur les contrats et documents officiels.</CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="org-legal-name">Raison sociale</FieldLabel>
              <Input id="org-legal-name" disabled={!canEdit} value={form.legalName} onChange={(event) => update("legalName", event.target.value)} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="org-registration">Numéro RCCM / registre</FieldLabel>
                <Input id="org-registration" disabled={!canEdit} value={form.registrationNumber} onChange={(event) => update("registrationNumber", event.target.value)} />
              </Field>
              <Field>
                <FieldLabel htmlFor="org-tax">Numéro fiscal (NINEA)</FieldLabel>
                <Input id="org-tax" disabled={!canEdit} value={form.taxId} onChange={(event) => update("taxId", event.target.value)} />
              </Field>
            </div>
          </FieldGroup>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Frais de gestion par défaut</CardTitle>
          <CardDescription>
            Barème appliqué aux immeubles qui n’ont pas de mandat de gestion propre. Un mandat configuré sur l’immeuble reste prioritaire.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <Field>
              <FieldLabel>Mode de calcul</FieldLabel>
              <Select value={form.defaultManagementFeeBasis || undefined} items={feeBasisOptions} onValueChange={(value) => update("defaultManagementFeeBasis", String(value))}>
                <SelectTrigger className="w-full" disabled={!canEdit}>
                  <SelectValue placeholder="Aucun barème par défaut" />
                </SelectTrigger>
                <SelectContent>
                  {feeBasisOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldDescription>Laissez vide pour ne facturer aucun frais par défaut.</FieldDescription>
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="org-fee-percent">Pourcentage (%)</FieldLabel>
                <Input id="org-fee-percent" type="number" min={0} max={100} step="0.01" disabled={!canEdit} value={form.defaultFeePercent} onChange={(event) => update("defaultFeePercent", event.target.value)} />
              </Field>
              <Field>
                <FieldLabel htmlFor="org-fee-amount">Montant fixe (FCFA)</FieldLabel>
                <Input id="org-fee-amount" type="number" min={0} step="1" disabled={!canEdit} value={form.defaultFeeAmount} onChange={(event) => update("defaultFeeAmount", event.target.value)} />
              </Field>
            </div>
            <FieldDescription>Utilisés uniquement pour les immeubles sans mandat de gestion en vigueur.</FieldDescription>
          </FieldGroup>
        </CardContent>
      </Card>

      {canEdit && (
        <div className="flex justify-end">
          <Button type="submit" disabled={saving}>
            {saving ? <Spinner data-icon="inline-start" /> : <Save data-icon="inline-start" />}
            Enregistrer
          </Button>
        </div>
      )}
    </form>
  );
}
