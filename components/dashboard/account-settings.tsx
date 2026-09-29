"use client";

import { KeyRound, LogOut, Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { ApiError, apiFetch } from "@/lib/api";
import { authClient } from "@/lib/auth-client";
import type { ApiUser } from "@/lib/dashboard-types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";

const roleLabels: Record<ApiUser["role"], string> = {
  owner: "Propriétaire",
  manager: "Gérant",
  tenant: "Locataire",
};

export function AccountSettings({ user }: { user: ApiUser }) {
  const router = useRouter();
  const [name, setName] = useState(user.name);
  const [phone, setPhone] = useState(user.phone ?? "");
  const [savingProfile, setSavingProfile] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingProfile(true);
    try {
      await apiFetch("/api/users/me", { method: "PATCH", body: JSON.stringify({ name, phone: phone.trim() || null }) });
      toast.success("Profil mis à jour.");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Impossible de mettre à jour le profil.");
    } finally {
      setSavingProfile(false);
    }
  }

  async function savePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingPassword(true);
    try {
      const result = await authClient.changePassword({ currentPassword, newPassword, revokeOtherSessions: true });
      if (result.error) throw new Error(result.error.message ?? "Impossible de modifier le mot de passe.");
      toast.success("Mot de passe mis à jour.");
      setCurrentPassword("");
      setNewPassword("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Impossible de modifier le mot de passe.");
    } finally {
      setSavingPassword(false);
    }
  }

  async function signOut() {
    await authClient.signOut();
    window.location.href = "/login";
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Profil</CardTitle>
          <CardDescription>Le nom et le téléphone affichés dans l’application.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={saveProfile} className="flex flex-col gap-5">
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="settings-name">Nom complet</FieldLabel>
                <Input id="settings-name" required value={name} onChange={(event) => setName(event.target.value)} />
              </Field>
              <Field>
                <FieldLabel htmlFor="settings-phone">Téléphone</FieldLabel>
                <Input id="settings-phone" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="+221 77 000 00 00" />
                <FieldDescription>Format international, utilisé pour les rappels WhatsApp et SMS.</FieldDescription>
              </Field>
              <Field orientation="horizontal">
                <FieldLabel>Adresse email</FieldLabel>
                <span className="flex items-center gap-2 text-sm text-muted-foreground">
                  {user.email}
                  <Badge variant="secondary">{roleLabels[user.role] ?? user.role}</Badge>
                </span>
              </Field>
            </FieldGroup>
            <div className="flex justify-end">
              <Button type="submit" disabled={savingProfile}>
                {savingProfile ? <Spinner data-icon="inline-start" /> : <Save data-icon="inline-start" />}
                Enregistrer
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Sécurité</CardTitle>
          <CardDescription>Changez votre mot de passe. Les autres sessions seront déconnectées.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={savePassword} className="flex flex-col gap-5">
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="settings-current-password">Mot de passe actuel</FieldLabel>
                <Input
                  id="settings-current-password"
                  type="password"
                  required
                  autoComplete="current-password"
                  value={currentPassword}
                  onChange={(event) => setCurrentPassword(event.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="settings-new-password">Nouveau mot de passe</FieldLabel>
                <Input
                  id="settings-new-password"
                  type="password"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                />
                <FieldDescription>8 caractères minimum.</FieldDescription>
              </Field>
            </FieldGroup>
            <div className="flex justify-end">
              <Button type="submit" variant="outline" disabled={savingPassword}>
                {savingPassword ? <Spinner data-icon="inline-start" /> : <KeyRound data-icon="inline-start" />}
                Modifier le mot de passe
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Session</CardTitle>
          <CardDescription>Déconnectez-vous de cet appareil.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" onClick={() => void signOut()}>
            <LogOut data-icon="inline-start" />
            Se déconnecter
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
