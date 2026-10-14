import Link from "next/link";

/** Minimal billing layout: no dashboard shell or navigation on purpose. */
export default function BillingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-4xl flex-col gap-6 px-4 py-8 sm:px-6">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <Link href="/" className="text-lg font-bold">
          Naya
        </Link>
        <nav className="flex items-center gap-4 text-sm text-muted-foreground">
          <Link className="hover:underline" href="/policy">
            Politique de facturation
          </Link>
        </nav>
      </header>
      <main className="flex flex-col gap-6">{children}</main>
    </div>
  );
}
