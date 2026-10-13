import { verifySession } from "@/lib/dal";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await verifySession();
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6">
      <header className="flex flex-col gap-1">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Plateforme Naya — réservé à l’administrateur</p>
        <h1 className="text-2xl font-bold">Administration des abonnements</h1>
      </header>
      {children}
    </div>
  );
}
