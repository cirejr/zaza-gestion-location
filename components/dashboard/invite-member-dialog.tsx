"use client";

import { Check, Copy, Mail, UserPlus } from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { ApiError, apiFetch } from "@/lib/api";
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
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";

const roleOptions = [
  { value: "manager", label: "Gérant" },
  { value: "owner", label: "Propriétaire" },
];

type InvitationResult = { inviteUrl: string; delivered: boolean; providerMessage?: string };

/**
 * Owner-only invite flow. When Resend is not configured the API returns the
 * signup link so the owner can share it manually instead of the invitation
 * silently going nowhere.
 */
export function InviteMemberDialog() {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("manager");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<InvitationResult | null>(null);
  const [copied, setCopied] = useState(false);

  function reset() {
    setEmail("");
    setRole("manager");
    setResult(null);
    setCopied(false);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    try {
      const response = await apiFetch<{ data: { id: string }; delivery: { delivered: boolean; providerMessage?: string }; inviteUrl: string }>(
        "/api/users/invitations",
        { method: "POST", body: JSON.stringify({ email, role }) },
      );
      if (response.delivery.delivered) {
        toast.success(`Invitation envoyée à ${email}.`);
        setOpen(false);
        reset();
      } else {
        setResult({ inviteUrl: response.inviteUrl, delivered: false, providerMessage: response.delivery.providerMessage });
        toast.warning("Invitation créée, mais l’email n’a pas pu être envoyé.");
      }
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Impossible de créer l’invitation.");
    } finally {
      setSubmitting(false);
    }
  }

  async function copyLink() {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.inviteUrl);
      setCopied(true);
      toast.success("Lien copié.");
    } catch {
      toast.error("Copie impossible — sélectionnez le lien manuellement.");
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger render={<Button />}>
        <UserPlus data-icon="inline-start" />
        Inviter un membre
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Inviter un membre</DialogTitle>
          <DialogDescription>
            L’invité crée son compte avec cette adresse email et rejoint l’équipe avec le rôle choisi.
          </DialogDescription>
        </DialogHeader>
        {result ? (
          <div className="flex flex-col gap-3">
            <div className="rounded-lg border border-amber-300/50 bg-amber-50 p-3 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
              Email non envoyé{result.providerMessage ? ` (${result.providerMessage})` : ""}. Partagez ce lien d’invitation manuellement :
            </div>
            <div className="flex items-center gap-2">
              <Input readOnly value={result.inviteUrl} className="font-mono text-xs" onFocus={(event) => event.target.select()} />
              <Button type="button" variant="outline" size="icon" aria-label="Copier le lien" onClick={() => void copyLink()}>
                {copied ? <Check /> : <Copy />}
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={submit} className="flex flex-col gap-5">
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="invite-email">Adresse email</FieldLabel>
                <Input
                  id="invite-email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="gerant@exemple.com"
                />
              </Field>
              <Field>
                <FieldLabel>Rôle</FieldLabel>
                <Select value={role} items={roleOptions} onValueChange={(value) => setRole(String(value))}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {roleOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FieldDescription>Un gérant gère les immeubles qui lui sont confiés ; un propriétaire a un accès complet.</FieldDescription>
              </Field>
            </FieldGroup>
            <DialogFooter>
              <Button type="submit" disabled={submitting}>
                {submitting ? <Spinner data-icon="inline-start" /> : <Mail data-icon="inline-start" />}
                Envoyer l’invitation
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
