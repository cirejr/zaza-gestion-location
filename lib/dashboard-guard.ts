import { redirect } from "next/navigation";
import { cache } from "react";
import { getServerSession } from "@/lib/session";
import { serverApiFetch } from "@/lib/server-api";
import type { ApiUser } from "@/lib/dashboard-types";

/**
 * Guards dashboard layouts and pages. Next.js renders the layout and the page
 * segment in parallel, so the layout's tenant redirect alone is not enough:
 * a page could fire owner/manager-only API calls before the redirect wins.
 * Call `await requireDashboardUser()` at the top of every dashboard page so
 * tenant-role and phone-only accounts are sent to their portal before any
 * protected endpoint is requested.
 *
 * The guard is memoized with React `cache()` per server request, so the layout
 * and its page share a single session check + `/api/users/me` call instead of
 * each resolving the actor independently on every render.
 */
export const requireDashboardUser = cache(async (): Promise<ApiUser> => {
  const session = await getServerSession();
  if (!session) redirect("/login?redirect=/");
  // Phone-only tenant accounts have no dashboard identity — portal instead.
  if (!session.user.email) redirect("/espace-locataire");
  const response = await serverApiFetch<{ data: ApiUser }>("/api/users/me");
  // Tenant-role accounts use the tenant portal instead of the management dashboard.
  if (response.data.role === "tenant") redirect("/espace-locataire");
  return response.data;
});