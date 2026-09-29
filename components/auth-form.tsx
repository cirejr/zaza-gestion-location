"use client";

import { AlertCircle, ArrowRight, Eye, EyeOff, KeyRound, LockKeyhole, Mail, Phone, ShieldCheck, Sparkles } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldSeparator } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Spinner } from "@/components/ui/spinner";

type AuthMode = "login" | "signup";

function errorMessage(value: unknown) {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "message" in value && typeof value.message === "string") return value.message;
  return "Une erreur est survenue. Réessayez.";
}

export default function AuthForm({ mode }: { mode: AuthMode }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);
    try {
      const result = mode === "login"
        ? await authClient.signIn.email({ email, password, callbackURL: "/" })
        : await authClient.signUp.email({ name, email, password, callbackURL: "/" });
      if (result.error) {
        setError(errorMessage(result.error));
        return;
      }
      router.push("/");
      router.refresh();
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogle() {
    setError(null);
    setLoading(true);
    try {
      const result = await authClient.signIn.social({ provider: "google", callbackURL: "/" });
      if (result.error) {
        setError(errorMessage(result.error));
        setLoading(false);
      }
    } catch (requestError) {
      setError(errorMessage(requestError));
      setLoading(false);
    }
  }

  async function sendOtp() {
    setError(null);
    setSuccess(null);
    if (!phone.trim()) {
      setError("Saisissez votre numéro de téléphone.");
      return;
    }
    setLoading(true);
    try {
      const result = await authClient.phoneNumber.sendOtp({ phoneNumber: phone });
      if (result.error) {
        setError(errorMessage(result.error));
        return;
      }
      setOtpSent(true);
      setSuccess("Code envoyé par SMS.");
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setLoading(false);
    }
  }

  async function verifyOtp() {
    setError(null);
    setLoading(true);
    try {
      const result = await authClient.phoneNumber.verify({ phoneNumber: phone, code: otp });
      if (result.error) {
        setError(errorMessage(result.error));
        return;
      }
      setSuccess("Code vérifié. Redirection en cours…");
      router.push("/");
      router.refresh();
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="w-full max-w-[430px] border-border/70 shadow-xl">
      <CardHeader className="gap-2">
        <div className="mb-2 flex items-center gap-2.5">
          <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground"><Sparkles /></span>
          <div>
            <p className="text-lg font-black tracking-[-0.06em]">naya</p>
            <p className="text-[9px] font-semibold uppercase tracking-[0.17em] text-muted-foreground">gestion locative</p>
          </div>
        </div>
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-primary">{mode === "login" ? "Bon retour parmi nous" : "Votre espace commence ici"}</p>
        <CardTitle className="text-2xl leading-tight tracking-tight">{mode === "login" ? "Reprenez le contrôle." : "Pilotez vos immeubles, simplement."}</CardTitle>
        <CardDescription>{mode === "login" ? "Connectez-vous pour suivre vos loyers, vos bâtiments et vos équipes en toute clarté." : "Créez votre compte et centralisez vos loyers, charges et incidents au même endroit."}</CardDescription>
      </CardHeader>
      <CardContent>
        <FieldGroup>
          <Button type="button" variant="outline" onClick={() => void handleGoogle()} disabled={loading}>
            <span className="flex size-5 items-center justify-center rounded-full bg-background text-sm font-black text-primary">G</span>
            Continuer avec Google
          </Button>
          <FieldSeparator>ou par email</FieldSeparator>
          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            <FieldGroup>
              {mode === "signup" && (
                <Field>
                  <FieldLabel htmlFor="name">Nom complet</FieldLabel>
                  <div className="relative"><KeyRound className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input id="name" required value={name} onChange={(event) => setName(event.target.value)} placeholder="Awa Diop" className="pl-10" aria-invalid={Boolean(error)} /></div>
                </Field>
              )}
              <Field>
                <FieldLabel htmlFor="email">Adresse email</FieldLabel>
                <div className="relative"><Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input id="email" required type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="vous@exemple.com" className="pl-10" aria-invalid={Boolean(error)} /></div>
              </Field>
              <Field>
                <FieldLabel htmlFor="password">Mot de passe</FieldLabel>
                <div className="relative"><LockKeyhole className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input id="password" required minLength={8} type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="8 caractères minimum" className="px-10" aria-invalid={Boolean(error)} /><Button type="button" variant="ghost" size="icon-sm" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"} className="absolute right-1 top-1/2 -translate-y-1/2">{showPassword ? <EyeOff /> : <Eye />}</Button></div>
                <FieldDescription>Utilisez au moins 8 caractères.</FieldDescription>
              </Field>
              <Button type="submit" disabled={loading} className="w-full">
                {loading ? <><Spinner data-icon="inline-start" />Veuillez patienter...</> : <>{mode === "login" ? "Se connecter" : "Créer mon compte"}<ArrowRight data-icon="inline-end" /></>}
              </Button>
            </FieldGroup>
          </form>
          <FieldSeparator>ou par téléphone</FieldSeparator>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="phone">Connexion par SMS</FieldLabel>
              <div className="flex gap-2">
                <div className="relative flex-1"><Phone className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input id="phone" value={phone} onChange={(event) => { setPhone(event.target.value); setOtpSent(false); }} placeholder="+221 77 000 00 00" className="pl-10" /></div>
                <Button type="button" variant="outline" onClick={() => void sendOtp()} disabled={loading}>{otpSent ? "Renvoyer" : "Recevoir"}</Button>
              </div>
            </Field>
            {otpSent && (
              <Field>
                <FieldLabel htmlFor="otp">Code à 6 chiffres</FieldLabel>
                <InputOTP id="otp" value={otp} onChange={setOtp} maxLength={6}><InputOTPGroup>{Array.from({ length: 6 }).map((_, index) => <InputOTPSlot key={index} index={index} />)}</InputOTPGroup></InputOTP>
                <Button type="button" variant="secondary" onClick={() => void verifyOtp()} disabled={loading || otp.length < 6} className="w-full">Vérifier le code</Button>
              </Field>
            )}
          </FieldGroup>
          {error && <Alert variant="destructive"><AlertCircle /><AlertDescription>{error}</AlertDescription></Alert>}
          {success && <Alert><ShieldCheck /><AlertDescription>{success}</AlertDescription></Alert>}
        </FieldGroup>
        <p className="mt-6 text-center text-xs text-muted-foreground">{mode === "login" ? "Pas encore de compte ?" : "Vous avez déjà un compte ?"} <a href={mode === "login" ? "/signup" : "/login"} className="font-bold text-primary hover:underline">{mode === "login" ? "Créer un compte" : "Se connecter"}</a></p>
        {mode === "login" && <p className="mt-3 text-center text-[11px] text-muted-foreground"><a href="/forgot-password" className="hover:text-primary">Mot de passe oublié ?</a></p>}
      </CardContent>
    </Card>
  );
}
