import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { verifySession } from "@/lib/dal";
import { getServerSession } from "@/lib/session";
import { serverApiFetch } from "@/lib/server-api";
import { AdminNav } from "@/components/billing/admin/admin-nav";
import { AdminSignOutButton } from "@/components/billing/admin/sign-out-button";

/**
 * Platform-owner shell: sidebar navigation, no agency dashboard chrome.
 * Only reachable with a staff session; each page additionally enforces the
 * Better Auth `admin` role (403 → denied card).
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await verifySession();
  const session = await getServerSession();
  let pending = 0;
  try {
    const overview = await serverApiFetch<{ data: { pending?: number } }>("/api/admin/billing/overview");
    pending = Number(overview.data.pending ?? 0);
  } catch {
    // Non-admin visitors see the denied card on each page instead.
  }

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col gap-6 border-r bg-card p-4 lg:flex">
        <Link href="/admin" className="flex items-center gap-2.5 px-1">
          <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-lg font-black text-primary-foreground">n</span>
          <span>
            <span className="block text-base font-black tracking-tight">naya</span>
            <span className="block text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">administration</span>
          </span>
        </Link>
        <AdminNav pending={pending} />
        <div className="mt-auto flex flex-col gap-2 border-t pt-4 text-xs text-muted-foreground">
          <p className="truncate px-1">{session?.user.email ?? ""}</p>
          <div className="flex items-center gap-1">
            <Link href="/" className="flex items-center gap-1 rounded-md px-2 py-1.5 text-sm font-medium hover:bg-accent">
              <ArrowLeft className="size-4" /> Application
            </Link>
            <AdminSignOutButton />
          </div>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur">
          <div className="mx-auto flex w-full max-w-6xl items-center gap-3 px-4 py-3 sm:px-6">
            <Link href="/admin" className="font-black tracking-tight lg:hidden">naya admin</Link>
            <div className="min-w-0 flex-1 lg:hidden">
              <AdminNav pending={pending} orientation="horizontal" />
            </div>
            <div className="ml-auto hidden items-center gap-1 sm:flex lg:hidden">
              <AdminSignOutButton />
            </div>
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6">{children}</main>
      </div>
    </div>
  );
}
