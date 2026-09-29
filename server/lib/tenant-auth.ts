import { eq, or, sql } from "drizzle-orm";
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
 * Two numbers are the same when one normalized key ends with the other, so a
 * tenant may sign in with `+221 78 968 03 18`, `+221789680318` or the local
 * `78 968 03 18`. Seven digits is the shortest key accepted, to keep short
 * numbers from matching each other.
 */
export function phoneMatches(left: string, right: string) {
  if (left.length < 7 || right.length < 7) return false;
  return left.endsWith(right) || right.endsWith(left);
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
      // The stored number is free text ("+221 78 968 03 18"), so the prefilter has
      // to strip its separators too — an `ilike` on the bare digits never matches
      // a formatted number. This cannot use an index, but `tenants` holds one row
      // per tenant; the exact `phoneMatches` comparison below is what decides.
      const rows = await db
        .select()
        .from(tenants)
        .where(
          or(
            sql`regexp_replace(${tenants.phone}, '\\D', '', 'g') like ${`%${key}%`}`,
            sql`regexp_replace(coalesce(${tenants.whatsappNumber}, ''), '\\D', '', 'g') like ${`%${key}%`}`,
          ),
        )
        .limit(20);
      // No fallback on "first candidate": linking the wrong tenant would expose
      // someone else's lease and payments.
      const match = rows.find(
        (row) => phoneMatches(phoneKey(row.whatsappNumber), key) || phoneMatches(phoneKey(row.phone), key),
      );
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