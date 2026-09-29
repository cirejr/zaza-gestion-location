"use client";

import { CheckCircle2, KeyRound, LockKeyhole } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { authClient } from "@/lib/auth-client";

export default function ResetPasswordPage() {
  const [token, setToken] = useState("");
  const [password, setPassword] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setToken(new URLSearchParams(window.location.search).get("token") ?? "");
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    const result = await authClient.resetPassword({ token, newPassword: password });
    if (result.error) setError(result.error.message ?? "Lien invalide.");
    else setDone(true);
    setLoading(false);
  }

  return <main className="flex min-h-screen items-center justify-center bg-[#f6f8f4] px-4"><div className="w-full max-w-[420px] rounded-[24px] border border-[#e0e9e0] bg-white p-7 shadow-[0_20px_60px_rgba(22,61,53,0.08)] sm:p-9"><a href="/login" className="mb-8 inline-block text-[11px] font-bold text-[#3b765e]">← Retour à la connexion</a>{done ? <div className="text-center"><span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#e8f6ed] text-[#388159]"><CheckCircle2 size={23} /></span><h1 className="mt-5 text-[24px] font-black tracking-[-0.05em] text-[#173d35]">Mot de passe mis à jour</h1><p className="mt-3 text-[12px] leading-6 text-[#71817c]">Vous pouvez maintenant vous connecter avec votre nouveau mot de passe.</p><a href="/login" className="mt-6 inline-flex rounded-xl bg-[#123e35] px-4 py-2.5 text-[11px] font-bold text-[#c9f06b]">Se connecter</a></div> : <><span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#e6f4e9] text-[#287154]"><KeyRound size={19} /></span><h1 className="mt-5 text-[25px] font-black tracking-[-0.05em] text-[#173d35]">Créer un nouveau mot de passe</h1><p className="mt-2 text-[12px] leading-6 text-[#71817c]">Choisissez un mot de passe d’au moins 8 caractères.</p><form onSubmit={submit} className="mt-6 space-y-4"><label className="block"><span className="mb-1.5 block text-[11px] font-bold text-[#587469]">Nouveau mot de passe</span><span className="relative block"><LockKeyhole size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9aa9a2]" /><input required minLength={8} type="password" value={password} onChange={(event) => setPassword(event.target.value)} className="h-11 w-full rounded-xl border border-[#dfe8df] pl-10 pr-3 text-[12px] outline-none focus:border-[#8eb49a]" /></span></label><button disabled={loading || !token} className="h-11 w-full rounded-xl bg-[#123e35] text-[11px] font-bold text-[#c9f06b] disabled:opacity-50">{loading ? "Mise à jour..." : "Mettre à jour"}</button></form>{error && <p className="mt-4 rounded-xl bg-[#fff0eb] px-3 py-2.5 text-[11px] font-semibold text-[#b85b42]">{error}</p>}</>}</div></main>;
}
