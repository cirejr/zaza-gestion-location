import AuthForm from "@/components/auth-form";

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center overflow-hidden bg-[#f6f8f4] px-4 py-10 sm:px-8">
      <div className="absolute -left-40 -top-40 h-[520px] w-[520px] rounded-full bg-[#e5f2e8] blur-3xl" />
      <div className="absolute -bottom-48 -right-32 h-[520px] w-[520px] rounded-full bg-[#fff0e3] blur-3xl" />
      <div className="relative z-10 flex w-full max-w-[980px] overflow-hidden rounded-[28px] border border-[#e0e9e0] bg-white/80 shadow-[0_25px_80px_rgba(22,61,53,0.08)] backdrop-blur-sm">
        <div className="hidden w-[43%] flex-col justify-between bg-[#123e35] p-8 text-white lg:flex"><div><span className="flex h-10 w-10 items-center justify-center rounded-[14px] bg-[#c9f06b] text-[#123e35]"><span className="text-lg font-black">n</span></span><p className="mt-5 text-[11px] font-bold uppercase tracking-[0.18em] text-[#a9c7b7]">La gestion locative, autrement.</p><h2 className="mt-5 text-[32px] font-black leading-[1.08] tracking-[-0.06em]">Vos immeubles.<br /><span className="text-[#c9f06b]">Sous contrôle.</span></h2><p className="mt-5 max-w-[260px] text-[12px] leading-6 text-[#b7d1c3]">Loyers, charges, baux et travaux réunis dans un espace pensé pour les propriétaires et gérants.</p></div><div className="rounded-2xl border border-white/10 bg-white/[0.07] p-4"><p className="text-[10px] font-bold uppercase tracking-wider text-[#a9c7b7]">Aujourd’hui</p><p className="mt-2 text-[22px] font-black text-[#c9f06b]">85%</p><p className="mt-1 text-[10px] text-[#b7d1c3]">de recouvrement sur votre portefeuille</p></div></div>
        <div className="flex-1 p-6 sm:p-10"><AuthForm mode="login" /></div>
      </div>
    </main>
  );
}
