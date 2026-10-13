import { eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { getDb } from "@/db";
import { authUsers } from "@/db/schema";
import type { RequestContext } from "@/server/lib/http";

/**
 * Platform (SaaS owner) guard. Uses the Better Auth `user.role` column as the
 * source of truth — never a client claim. Agency owner/manager roles are a
 * separate concern handled by `requireActor`/`requireRole`.
 */
export async function requirePlatformAdmin(c: RequestContext) {
  const session = c.get("session");
  if (!session?.user) throw new HTTPException(401, { message: "Authentication required." });
  const db = getDb();
  const [row] = await db.select().from(authUsers).where(eq(authUsers.id, session.user.id)).limit(1);
  if (!row || row.banned) {
    throw new HTTPException(403, { message: "Accès réservé à l'administrateur de la plateforme." });
  }
  if (row.role !== "admin") {
    throw new HTTPException(403, { message: "Accès réservé à l'administrateur de la plateforme." });
  }
  return row;
}
