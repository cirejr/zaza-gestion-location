import { headers } from "next/headers";
import { auth } from "@/lib/auth";

/** Session helper for Server Actions, which do not pass through Hono middleware. */
export async function getServerSession() {
  return auth.api.getSession({ headers: await headers() });
}

export async function requireServerSession() {
  const session = await getServerSession();
  if (!session) throw new Error("Authentication required.");
  return session;
}
