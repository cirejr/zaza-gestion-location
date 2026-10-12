"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Building2, Check, ImagePlus, Mail, PartyPopper, Percent } from "lucide-react";
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

const steps = ["Agence", "Frais de gestion", "Équipe"] as const;

const feeBasisOptions = [
  { value: "percent_collected", label: "Pourcentage des loyers encaissés" },
  { value: "percent_due", label: "Pourcentage des loyers facturés" },
  { value: "fixed", label: "Montant fixe par période" },
  { value: "percent_collected_plus_fixed", label: "Pourcentage encaissé + montant fixe" },
];

function toNumber(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * First-run wizard for a brand-new agency owner. Each step persists as the owner
 * advances (so a refresh resumes where they left off); optional steps can be
 * skipped. The final step closes the gate by setting `onboarded`.
 */
export function OnboardingWizard({ organization, ownerName }: { organization: ApiOrganizationDetail; ownerName: string }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [logo, setLogo] = useState(organization.logo ?? "");
  const [identity, setIdentity] = useState({
    name: organization.name,
    contactPhone: organization.contactPhone ?? "",
    contactEmail: organization.contactEmail ?? "",
    city: organization.city ?? "",
    country: organization.country ?? "Sénégal",
  });
  const [fee, setFee] = useState({
    basis: organization.defaultManagementFeeBasis ?? "",
    percent: organization.defaultFeePercent ?? "",
    amount: organization.defaultFeeAmount ?? "",
  });
  const [invite, setInvite] = useState({ email: "", role: "manager" });

  async function patchOrganization(body: Record<string, unknown>) {
    await apiFetch("/api/organization", { method: "PATCH", body: JSON.stringify(body) });
  }

  async function saveIdentity() {
    if (!identity.name.trim()) {
      toast.error("Le nom de l’agence est obligatoire.");
      return false;
    }
    await patchOrganization({
      name: identity.name.trim(),
      logo,
      contactPhone: identity.contactPhone.trim() || null,
      contactEmail: identity.contactEmail.trim() || null,
      city: identity.city.trim() || null,
      country: identity.country.trim() || "Sénégal",
    });
    return true;
  }

  async function uploadLogo(file: File) {
    setUploading(true);
    try {
      setLogo(await uploadFile(file, "agency"));
      toast.success("Logo téléversé.");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Téléversement impossible.");
    } finally {
      setUploading(false);
    }
  }

  async function goNext() {
    setSaving(true);
    try {
      if (step === 0 && !(await saveIdentity())) return;
      if (step === 1) {
        await patchOrganization({
          defaultManagementFeeBasis: fee.basis || null,
          defaultFeePercent: toNumber(fee.percent),
          defaultFeeAmount: toNumber(fee.amount),
        });
      }
      setStep((value) => Math.min(value + 1, steps.length - 1));
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Enregistrement impossible.");
    } finally {
      setSaving(false);
    }
  }

  async function finish(sendInvite: boolean) {
    setSaving(true);
    try {
      if (sendInvite && invite.email.trim()) {
        await apiFetch("/api/users/invitations", {
          method: "POST",
          body: JSON.stringify({ email: invite.email.trim(), role: invite.role }),
        });
      }
      await patchOrganization({ onboarded: true });
      toast.success("Votre agence est prête !");
      router.push("/");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Impossible de terminer l’installation.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 p-4 sm:p-8">
      <div className="w-full max-w-2xl">
        <div className="mb-6 flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-xl bg-primary font-black text-primary-foreground">n</span>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.17em] text-muted-foreground">Bienvenue {ownerName.split(" ")[0]}</p>
            <h1 className="text-xl font-bold tracking-tight">Configurons votre agence</h1>
          </div>
        </div>

        <ol className="mb-6 flex items-center gap-2">
          {steps.map((label, index) => (
            <li key={label} className="flex flex-1 items-center gap-2">
              <span className={`flex size-7 items-center justify-center rounded-full text-xs font-bold ${index < step ? "bg-primary text-primary-foreground" : index === step ? "bg-secondary text-secondary-foreground" : "bg-muted text-muted-foreground"}`}>
                {index < step ? <Check className="size-4" /> : index + 1}
              </span>
              <span className={`text-xs font-semibold ${index <= step ? "text-foreground" : "text-muted-foreground"}`}>{label}</span>
              {index < steps.length - 1 && <span className="hidden h-px flex-1 bg-border sm:block" />}
            </li>
          ))}
        </ol>

        <Card>
          {step === 0 && (
            <>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Building2 className="size-5" />Votre agence</CardTitle>
                <CardDescription>Ces informations apparaîtront sur vos reçus, contrats et relevés.</CardDescription>
              </CardHeader>
              <CardContent>
                <FieldGroup>
                  <div className="flex items-center gap-4">
                    <span className="flex size-16 items-center justify-center overflow-hidden rounded-2xl border bg-secondary">
                      {logo ? <img src={logo} alt="Logo" className="size-full object-cover" /> : <Building2 className="text-muted-foreground" />}
                    </span>
                    <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold hover:bg-accent">
                      {uploading ? <Spinner /> : <ImagePlus className="size-4" />}
                      Ajouter un logo
                      <input type="file" accept="image/png,image/jpeg" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadLogo(file); }} />
                    </label>
                  </div>
                  <Field>
                    <FieldLabel htmlFor="onb-name">Nom de l’agence</FieldLabel>
                    <Input id="onb-name" value={identity.name} onChange={(event) => setIdentity({ ...identity, name: event.target.value })} placeholder="Agence Diagne Immobilier" />
                  </Field>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field>
                      <FieldLabel htmlFor="onb-phone">Téléphone</FieldLabel>
                      <Input id="onb-phone" value={identity.contactPhone} onChange={(event) => setIdentity({ ...identity, contactPhone: event.target.value })} placeholder="+221 33 000 00 00" />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="onb-email">Email de contact</FieldLabel>
                      <Input id="onb-email" type="email" value={identity.contactEmail} onChange={(event) => setIdentity({ ...identity, contactEmail: event.target.value })} />
                    </Field>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field>
                      <FieldLabel htmlFor="onb-city">Ville</FieldLabel>
                      <Input id="onb-city" value={identity.city} onChange={(event) => setIdentity({ ...identity, city: event.target.value })} placeholder="Dakar" />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="onb-country">Pays</FieldLabel>
                      <Input id="onb-country" value={identity.country} onChange={(event) => setIdentity({ ...identity, country: event.target.value })} />
                    </Field>
                  </div>
                </FieldGroup>
              </CardContent>
            </>
          )}

          {step === 1 && (
            <>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Percent className="size-5" />Vos frais de gestion</CardTitle>
                <CardDescription>Le barème appliqué aux immeubles sans mandat de gestion propre. Vous pourrez l’ajuster plus tard.</CardDescription>
              </CardHeader>
              <CardContent>
                <FieldGroup>
                  <Field>
                    <FieldLabel>Mode de calcul</FieldLabel>
                    <Select value={fee.basis || undefined} items={feeBasisOptions} onValueChange={(value) => setFee({ ...fee, basis: String(value) })}>
                      <SelectTrigger className="w-full"><SelectValue placeholder="Aucun barème par défaut" /></SelectTrigger>
                      <SelectContent>
                        {feeBasisOptions.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </Field>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field>
                      <FieldLabel htmlFor="onb-percent">Pourcentage (%)</FieldLabel>
                      <Input id="onb-percent" type="number" min={0} max={100} step="0.01" value={fee.percent} onChange={(event) => setFee({ ...fee, percent: event.target.value })} disabled={!fee.basis} />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="onb-amount">Montant fixe (FCFA)</FieldLabel>
                      <Input id="onb-amount" type="number" min={0} step="1" value={fee.amount} onChange={(event) => setFee({ ...fee, amount: event.target.value })} disabled={!fee.basis} />
                    </Field>
                  </div>
                  <FieldDescription>Laissez vide pour ne facturer aucun frais de gestion par défaut.</FieldDescription>
                </FieldGroup>
              </CardContent>
            </>
          )}

          {step === 2 && (
            <>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Mail className="size-5" />Invitez votre équipe</CardTitle>
                <CardDescription>Optionnel : ajoutez un gérant qui vous aidera à piloter les biens.</CardDescription>
              </CardHeader>
              <CardContent>
                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor="onb-invite">Email de l’invité</FieldLabel>
                    <Input id="onb-invite" type="email" value={invite.email} onChange={(event) => setInvite({ ...invite, email: event.target.value })} placeholder="gerant@agence.com" />
                  </Field>
                  <Field>
                    <FieldLabel>Rôle</FieldLabel>
                    <Select value={invite.role} items={[{ value: "manager", label: "Gérant" }, { value: "owner", label: "Propriétaire" }]} onValueChange={(value) => setInvite({ ...invite, role: String(value) })}>
                      <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="manager">Gérant</SelectItem>
                        <SelectItem value="owner">Propriétaire</SelectItem>
                      </SelectContent>
                    </Select>
                    <FieldDescription>Vous pourrez envoyer d’autres invitations depuis Paramètres → Équipe.</FieldDescription>
                  </Field>
                </FieldGroup>
              </CardContent>
            </>
          )}

          <div className="flex items-center justify-between gap-3 border-t px-6 py-4">
            <Button type="button" variant="ghost" onClick={() => setStep((value) => Math.max(value - 1, 0))} disabled={step === 0 || saving}>
              <ArrowLeft data-icon="inline-start" />Précédent
            </Button>
            <div className="flex items-center gap-2">
              {step === 2 && (
                <Button type="button" variant="ghost" onClick={() => void finish(false)} disabled={saving}>Passer</Button>
              )}
              {step < 2 ? (
                <Button type="button" onClick={() => void goNext()} disabled={saving}>
                  {saving ? <Spinner data-icon="inline-start" /> : null}
                  Continuer<ArrowRight data-icon="inline-end" />
                </Button>
              ) : (
                <Button type="button" onClick={() => void finish(true)} disabled={saving}>
                  {saving ? <Spinner data-icon="inline-start" /> : <PartyPopper data-icon="inline-start" />}
                  Terminer
                </Button>
              )}
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
