import { eq, ilike, or } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { getDb } from "@/db";
import { tenants, type Tenant } from "@/db/schema";
import type { RequestContext } from "@/server/lib/http";

/** Normalized phone key: digits only, leading zeros stripped, last 12 kept. */
export function phoneKey(value: string | null | undefined) {
  if (!value) return "";
  return value.replace(/[^0-9]/g, "").replace(/^0+/, "").slice(-12);
}

/**
 * Resolve the tenant linked to the authenticated portal user.
 *
 * 1. Direct link via `tenants.user_id` set on a previous access.
 * 2. Self-serve phone match: the verified phone on the Better Auth account is
 *    matched to the tenant record (phone or WhatsApp number) and the link is
 *    persisted for fast lookups afterwards.
 */
export async function resolvePortalTenant(c: RequestContext): Promise<Tenant> {
  const session = c.get("session");
  if (!session?.user) throw new HTTPException(401, { message: "Authentication required." });
  const db = getDb();

  if (session.user.id) {
    const [linked] = await db.select().from(tenants).where(eq(tenants.userId, session.user.id)).limit(1);
    if (linked) return linked;
  }

  const phone = session.user.phoneNumber;
  if (phone) {
    const key = phoneKey(phone);
    if (key) {
      const rows = await db
        .select()
        .from(tenants)
        .where(or(ilike(tenants.phone, `%${key}%`), ilike(tenants.whatsappNumber, `%${key}%`)))
        .limit(20);
      const match = rows.find((row) => phoneKey(row.whatsappNumber) === key || phoneKey(row.phone) === key) ?? rows[0];
      if (match) {
        if (!match.userId && session.user.id) {
          await db.update(tenants).set({ userId: session.user.id }).where(eq(tenants.id, match.id));
        }
        return match;
      }
    }
  }

  throw new HTTPException(404, { message: "Votre numéro n’est rattaché à aucun locataire de la plateforme. Contactez votre gestionnaire." });
}