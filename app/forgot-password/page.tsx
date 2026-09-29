"use client";

import { ArrowLeft, CheckCircle2, Mail, Send } from "lucide-react";
import { useState, type FormEvent } from "react";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/request-password-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, redirectTo: "/reset-password" }),
      });
      if (!response.ok) throw new Error("Impossible d'envoyer le lien pour le moment.");
      setSent(true);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Une erreur est survenue.");
    } finally {
      setLoading(false);
    }
  }

  return <main className="flex min-h-screen items-center justify-center bg-[#f6f8f4] px-4"><div className="w-full max-w-[420px] rounded-[24px] border border-[#e0e9e0] bg-white p-7 shadow-[0_20px_60px_rgba(22,61,53,0.08)] sm:p-9"><a href="/login" className="mb-8 inline-flex items-center gap-2 text-[11px] font-bold text-[#3b765e]"><ArrowLeft size={15} /> Retour à la connexion</a>{sent ? <div className="text-center"><span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#e8f6ed] text-[#388159]"><CheckCircle2 size={23} /></span><h1 className="mt-5 text-[24px] font-black tracking-[-0.05em] text-[#173d35]">Vérifiez votre boîte mail</h1><p className="mt-3 text-[12px] leading-6 text-[#71817c]">Si un compte existe pour <strong>{email}</strong>, vous recevrez un lien pour réinitialiser votre mot de passe.</p></div> : <><span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#e6f4e9] text-[#287154]"><Mail size={19} /></span><h1 className="mt-5 text-[25px] font-black tracking-[-0.05em] text-[#173d35]">Mot de passe oublié ?</h1><p className="mt-2 text-[12px] leading-6 text-[#71817c]">Saisissez votre email et nous vous enverrons les instructions de récupération.</p><form onSubmit={submit} className="mt-6 space-y-4"><input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="vous@exemple.com" className="h-11 w-full rounded-xl border border-[#dfe8df] px-3 text-[12px] text-[#41675b] outline-none focus:border-[#8eb49a]" /><button disabled={loading} className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#123e35] text-[11px] font-bold text-[#c9f06b] disabled:opacity-60">{loading ? "Envoi..." : "Envoyer le lien"}<Send size={14} /></button></form>{error && <p className="mt-4 rounded-xl bg-[#fff0eb] px-3 py-2.5 text-[11px] font-semibold text-[#b85b42]">{error}</p>}</>}</div></main>;
}
