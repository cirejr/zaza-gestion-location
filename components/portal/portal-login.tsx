"use client";

import { AlertCircle, ArrowRight, Phone, ShieldCheck, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { authClient } from "@/lib/auth-client";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Spinner } from "@/components/ui/spinner";

function errorMessage(value: unknown) {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "message" in value && typeof value.message === "string") return value.message;
  return "Une erreur est survenue. Réessayez.";
}

/** Phone + WhatsApp OTP sign-in used for the tenant portal. */
export function PortalLogin() {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function sendCode() {
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
      setSuccess("Code envoyé par WhatsApp. S’il n’arrive pas, vérifiez que ce numéro est bien le vôtre.");
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setLoading(false);
    }
  }

  async function verifyCode() {
    setError(null);
    setLoading(true);
    try {
      const result = await authClient.phoneNumber.verify({ phoneNumber: phone, code: otp });
      if (result.error) {
        setError(errorMessage(result.error));
        return;
      }
      router.push("/espace-locataire");
      router.refresh();
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!otpSent) {
      await sendCode();
    } else {
      await verifyCode();
    }
  }

  return (
    <div className="flex min-h-[calc(100dvh-64px)] items-center justify-center p-6">
      <Card className="w-full max-w-md border-border/70 shadow-xl">
        <CardHeader className="gap-2">
          <div className="mb-2 flex items-center gap-2.5">
            <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground"><Sparkles /></span>
            <div>
              <p className="text-lg font-black tracking-[-0.06em]">naya</p>
              <p className="text-[9px] font-semibold uppercase tracking-[0.17em] text-muted-foreground">espace locataire</p>
            </div>
          </div>
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-primary">Connexion par téléphone</p>
          <CardTitle className="text-2xl leading-tight tracking-tight">Votre espace, à portée de main.</CardTitle>
          <CardDescription>
            Entrez le numéro correspondant à votre bail : vous recevrez un code à 6 chiffres par WhatsApp.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="phone">Numéro de téléphone</FieldLabel>
                <div className="relative">
                  <Phone className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="phone"
                    value={phone}
                    onChange={(event) => { setPhone(event.target.value); setOtpSent(false); }}
                    placeholder="+221 77 000 00 00"
                    className="pl-10"
                    aria-invalid={Boolean(error)}
                  />
                </div>
                <FieldDescription>Format international : +221… pour le Sénégal.</FieldDescription>
              </Field>
              {otpSent && (
                <Field>
                  <FieldLabel htmlFor="otp">Code à 6 chiffres</FieldLabel>
                  <InputOTP id="otp" value={otp} onChange={setOtp} maxLength={6}>
                    <InputOTPGroup>{Array.from({ length: 6 }).map((_, index) => <InputOTPSlot key={index} index={index} />)}</InputOTPGroup>
                  </InputOTP>
                  <FieldError>{error ?? undefined}</FieldError>
                </Field>
              )}
              <Button type="submit" disabled={loading || (otpSent && otp.length < 6)} className="w-full">
                {loading
                  ? <><Spinner />Veuillez patienter...</>
                  : <>{otpSent ? "Vérifier le code" : "Recevoir le code"}<ArrowRight data-icon="inline-end" /></>}
              </Button>
            </FieldGroup>
            {error && otpSent && <Alert variant="destructive"><AlertCircle /><AlertDescription>{error}</AlertDescription></Alert>}
            {error && !otpSent && <Alert variant="destructive"><AlertCircle /><AlertDescription>{error}</AlertDescription></Alert>}
            {success && <Alert><ShieldCheck /><AlertDescription>{success}</AlertDescription></Alert>}
          </form>
          <p className="mt-6 text-center text-xs text-muted-foreground">
            Vous êtes propriétaire ou gérant ? <a href="/login" className="font-bold text-primary hover:underline">Connexion gestionnaires</a>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}