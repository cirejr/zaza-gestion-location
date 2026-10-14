import { cache } from "react";
import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/session";
import { isPortalEmail } from "@/lib/auth";
import { serverApiFetch } from "@/lib/server-api";
import type { ApiUser } from "@/lib/dashboard-types";

/**
 * Data Access Layer for the dashboard shell and pages.
 *
 * Two layers, per the optimistic/secure split:
 *
 * - `verifySession` is the cheap gate: it only resolves the Better Auth
 *   session (already memoized per request) and redirects anonymous visitors
 *   and portal identities. It performs no domain lookup, so pages that just
 *   need "a signed-in staff member" stop paying for a full actor resolution.
 * - `getViewer` is the full viewer DTO (session + domain user + agency
 *   summary + onboarding state), memoized per request. The shell's identity
 *   islands and the pages that actually render user data share this single
 *   call instead of each resolving the actor independently.
 *
 * Neither is the security boundary: every read and write is still authorized
 * inside the Hono routes (`requireActor`/`requireRole`), so a UI that renders
 * without a viewer can never leak or mutate another agency's data.
 */
export const verifySession = cache(async () => {
  const session = await getServerSession();
  if (!session) redirect("/login?redirect=/");
  // Portal identities (phone + OTP, synthetic `@portal.naya.app` email) and
  // accounts with no email at all belong in the tenant portal, never here.
  if (!session.user.email || isPortalEmail(session.user.email)) redirect("/espace-locataire");
  return session;
});

export const getViewer = cache(async (): Promise<ApiUser> => {
  const session = await verifySession();
  let user: ApiUser;
  try {
    user = (await serverApiFetch<{ data: ApiUser }>("/api/users/me")).data;
  } catch (error) {
    // Pure platform admins have no agency actor (`/api/users/me` 403s by
    // design): they work from /admin/facturation, never onboarding/billing.
    // Structural check (not instanceof): module duplication across RSC
    // boundaries must never swallow this redirect.
    if (
      (error as { status?: unknown } | null)?.status === 403 &&
      (session.user as { role?: unknown } | undefined)?.role === "admin"
    ) {
      redirect("/admin/facturation");
    }
    throw error;
  }
  // Tenant-role accounts use the tenant portal instead of the dashboard.
  if (user.role === "tenant") redirect("/espace-locataire");
  // The agency owner must finish the first-run wizard before reaching the
  // dashboard; managers and invited users are not gated.
  if (user.needsOnboarding) redirect("/onboarding");
  // Subscription lock: without an active or grace-period subscription the
  // whole dashboard (shell islands included, so every page) redirects to the
  // dedicated billing screen. The billing screen itself deliberately uses
  // `verifySession` instead of `getViewer`, so this cannot loop. Server-side
  // API enforcement lives in `subscriptionLockMiddleware`, not here.
  const billing = await serverApiFetch<{ data: { access: { allowed: boolean } } }>("/api/billing/subscription");
  if (!billing.data.access.allowed) redirect("/billing/subscription");
  return user;
});
