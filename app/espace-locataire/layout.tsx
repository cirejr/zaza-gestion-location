import Link from "next/link";

export default function EspaceLocataireLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-dvh bg-[#f6f8f4]">
      <header className="sticky top-0 z-10 flex h-16 items-center border-b bg-background/90 px-4 backdrop-blur sm:px-6">
        <Link href="/espace-locataire" className="flex items-center gap-2.5">
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground font-black">n</span>
          <span className="text-sm font-black tracking-[-0.03em]">naya <span className="font-semibold text-muted-foreground">· espace locataire</span></span>
        </Link>
      </header>
      {children}
    </main>
  );
}