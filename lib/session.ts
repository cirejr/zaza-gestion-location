import { cache } from "react";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";

/**
 * Session helper for Server Actions and SSR. Memoized with React `cache()` so
 * the layout and its pages share one session lookup per render instead of
 * each triggering a separate Better Auth + DB round-trip.
 */
export const getServerSession = cache(async () => {
  return auth.api.getSession({ headers: await headers() });
});

export async function requireServerSession() {
  const session = await getServerSession();
  if (!session) throw new Error("Authentication required.");
  return session;
}
