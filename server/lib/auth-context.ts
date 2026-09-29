import { and, count, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { getDb } from "@/db";
import { buildings, users, type User } from "@/db/schema";
import { countValue, type RequestContext } from "@/server/lib/http";

export type DomainUser = typeof users.$inferSelect;
export type AppRole = "owner" | "manager" | "tenant";

/**
 * Resolve the Better Auth identity to the application user profile used for
 * building ownership and role checks. The first authenticated account becomes
 * the initial owner; subsequent accounts default to tenant until an owner
 * assigns them a manager/owner role.
 */
export async function requireActor(c: RequestContext): Promise<DomainUser> {
  const session = c.get("session");
  if (!session) throw new HTTPException(401, { message: "Authentication required." });

  // Phone-only accounts (verified by SMS/WhatsApp OTP) have no email on the
  // Better Auth user and use the tenant portal instead of the dashboard.
  if (!session.user.email) {
    throw new HTTPException(403, { message: "Ce compte n’a pas d’adresse email. Utilisez l’espace locataire." });
  }
  const email = session.user.email.toLowerCase();
  const db = getDb();
  const [existing] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (existing) return existing;

  const countRows = await db.select({ total: count() }).from(users);
  const role: AppRole = countValue(countRows) === 0 ? "owner" : "tenant";
  const [created] = await db
    .insert(users)
    .values({ name: session.user.name, email, role })
    .onConflictDoNothing({ target: users.email })
    .returning();

  if (created) return created;
  const [raced] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!raced) throw new HTTPException(500, { message: "Could not create the application user." });
  return raced;
}

export function requireRole(actor: DomainUser, roles: AppRole[]) {
  if (!roles.includes(actor.role as AppRole)) {
    throw new HTTPException(403, { message: "You do not have permission to perform this action." });
  }
}

export async function getBuildingForActor(buildingId: string, actor: DomainUser) {
  const db = getDb();
  const [building] = await db.select().from(buildings).where(eq(buildings.id, buildingId)).limit(1);
  if (!building) throw new HTTPException(404, { message: "Building not found." });

  const ownsBuilding = building.ownerId === actor.id;
  const managesBuilding = building.managerId === actor.id;
  if (actor.role !== "owner" && !managesBuilding) {
    throw new HTTPException(403, { message: "You cannot access this building." });
  }
  if (actor.role === "owner" && !ownsBuilding && !managesBuilding) {
    throw new HTTPException(403, { message: "You cannot access this building." });
  }
  return building;
}

export function buildingAccessCondition(actor: DomainUser) {
  return actor.role === "owner" ? eq(buildings.ownerId, actor.id) : eq(buildings.managerId, actor.id);
}

export function assertSameBuilding(buildingId: string, candidate: { buildingId: string }) {
  if (buildingId !== candidate.buildingId) {
    throw new HTTPException(400, { message: "The resource does not belong to this building." });
  }
}

export type { User };
