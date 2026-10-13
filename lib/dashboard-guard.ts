import { cache } from "react";
import { getViewer } from "@/lib/dal";
import type { ApiUser } from "@/lib/dashboard-types";

/**
 * Guards dashboard pages that render the viewer itself. The check is memoized
 * with React `cache()` per server request, so the shell identity islands and
 * the page share a single session check + `/api/users/me` call instead of
 * each resolving the actor independently.
 *
 * Pages that only need "a signed-in staff member" should prefer
 * `verifySession()` from `@/lib/dal` — the full actor resolution here is only
 * worth it when the page renders user data. Authorization of the underlying
 * reads and writes always happens inside the API routes.
 */
export const requireDashboardUser = cache(async (): Promise<ApiUser> => {
  return getViewer();
});
