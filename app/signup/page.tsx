import AuthForm from "@/components/auth-form";

export default function SignupPage() {
  return (
    <main className="flex min-h-screen items-center justify-center overflow-hidden bg-[#f6f8f4] px-4 py-10 sm:px-8">
      <div className="absolute -right-40 -top-40 h-[520px] w-[520px] rounded-full bg-[#e5f2e8] blur-3xl" />
      <div className="absolute -bottom-48 -left-32 h-[520px] w-[520px] rounded-full bg-[#fff0e3] blur-3xl" />
      <div className="relative z-10 flex w-full max-w-[980px] overflow-hidden rounded-[28px] border border-[#e0e9e0] bg-white/80 shadow-[0_25px_80px_rgba(22,61,53,0.08)] backdrop-blur-sm">
        <div className="hidden w-[43%] flex-col justify-between bg-[#123e35] p-8 text-white lg:flex"><div><span className="flex h-10 w-10 items-center justify-center rounded-[14px] bg-[#c9f06b] text-[#123e35]"><span className="text-lg font-black">n</span></span><p className="mt-5 text-[11px] font-bold uppercase tracking-[0.18em] text-[#a9c7b7]">Commencez simplement.</p><h2 className="mt-5 text-[32px] font-black leading-[1.08] tracking-[-0.06em]">Moins de tableurs.<br /><span className="text-[#c9f06b]">Plus de visibilité.</span></h2><p className="mt-5 max-w-[260px] text-[12px] leading-6 text-[#b7d1c3]">Naya vous aide à savoir ce qui rentre, ce qui sort et ce qui nécessite votre attention.</p></div><div className="space-y-2 rounded-2xl border border-white/10 bg-white/[0.07] p-4 text-[10px] text-[#b7d1c3]"><p className="flex items-center gap-2"><span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#c9f06b] text-[#123e35]">✓</span>Collecte des loyers simplifiée</p><p className="flex items-center gap-2"><span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#c9f06b] text-[#123e35]">✓</span>Suivi des charges et travaux</p></div></div>
        <div className="flex-1 p-6 sm:p-10"><AuthForm mode="signup" /></div>
      </div>
    </main>
  );
}
