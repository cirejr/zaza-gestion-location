import { and, desc, eq, inArray } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { getDb } from "@/db";
import {
  apartments,
  authUsers,
  buildings,
  closureRequests,
  leases,
  organizationProfiles,
  organizations,
  prospects,
  tenants,
  users,
} from "@/db/schema";
import { BILLING_POLICY_VERSION } from "@/lib/billing-policy";
import { requireActor, requireRole } from "@/server/lib/auth-context";
import { notifyPlatformAdmins } from "@/server/lib/subscription-access";
import { parseBody } from "@/server/lib/http";
import type { ApiEnv } from "@/server/session-middleware";

const router = new Hono<ApiEnv>();

/**
 * Account surface. Deliberately OUTSIDE the subscription lock: policy
 * acceptance, data export and closure requests must stay reachable when an
 * agency is locked, and customer data is never deleted automatically.
 */

const policyInput = z.object({ version: z.string().trim().min(1).max(40) });

/** Stamp an explicit billing-policy acceptance (signup checkbox or billing-page backstop). */
router.post("/account/policy", async (c) => {
  const session = c.get("session");
  if (!session?.user) throw new HTTPException(401, { message: "Authentication required." });
  const body = await parseBody(c, policyInput);
  if (body.version !== BILLING_POLICY_VERSION) {
    throw new HTTPException(400, { message: "Version de politique inconnue." });
  }
  const db = getDb();
  const [updated] = await db
    .update(authUsers)
    .set({ policyVersion: body.version, policyAcceptedAt: new Date(), updatedAt: new Date() })
    .where(eq(authUsers.id, session.user.id))
    .returning({ version: authUsers.policyVersion, acceptedAt: authUsers.policyAcceptedAt });
  if (!updated) throw new HTTPException(404, { message: "Compte introuvable." });
  return c.json({ data: updated });
});

/** Full agency data export (JSON). Always available, including during a lock. */
router.get("/account/export", async (c) => {
  const actor = await requireActor(c);
  requireRole(actor, ["owner", "manager"]);
  const db = getDb();
  const orgId = actor.organizationId;
  const [org] = await db.select().from(organizations).where(eq(organizations.id, orgId)).limit(1);
  const [profile] = await db.select().from(organizationProfiles).where(eq(organizationProfiles.organizationId, orgId)).limit(1);
  const orgBuildings = await db.select().from(buildings).where(eq(buildings.organizationId, orgId));
  const apartmentsByBuilding = await Promise.all(
    orgBuildings.map(async (b) => ({
      building: b,
      apartments: await db.select().from(apartments).where(eq(apartments.buildingId, b.id)),
    })),
  );
  const apartmentIds = apartmentsByBuilding.flatMap((entry) => entry.apartments.map((a) => a.id));
  const orgLeases = apartmentIds.length
    ? await db.select().from(leases).where(inArray(leases.apartmentId, apartmentIds)).limit(1000)
    : [];
  const orgTenants = await db.select().from(tenants).where(eq(tenants.organizationId, orgId));
  const orgProspects = await db.select().from(prospects).where(eq(prospects.organizationId, orgId));
  const members = await db.select({ id: users.id, name: users.name, email: users.email, role: users.role }).from(users).where(eq(users.organizationId, orgId));
  return c.json({
    data: {
      exportedAt: new Date().toISOString(),
      organization: org ?? null,
      profile: profile ?? null,
      buildings: apartmentsByBuilding,
      tenants: orgTenants,
      leases: orgLeases,
      prospects: orgProspects,
      members,
    },
  });
});

const closureInput = z.object({ reason: z.string().trim().min(1).max(2000) });

/** Request account closure / support intervention. Owner-only, audited, admin-notified. */
router.post("/account/closure", async (c) => {
  const actor = await requireActor(c);
  requireRole(actor, ["owner"]);
  const body = await parseBody(c, closureInput);
  const db = getDb();
  const [existing] = await db
    .select()
    .from(closureRequests)
    .where(and(eq(closureRequests.agencyId, actor.organizationId), eq(closureRequests.status, "open")))
    .limit(1);
  if (existing) throw new HTTPException(409, { message: "Une demande est déjà en cours pour cette agence." });
  const [created] = await db
    .insert(closureRequests)
    .values({ agencyId: actor.organizationId, requestedBy: actor.id, reason: body.reason.trim(), status: "open" })
    .returning();
  await notifyPlatformAdmins(db, {
    type: "account_closure_requested",
    title: "Demande de fermeture de compte",
    body: `${actor.organizationId} : ${body.reason.trim().slice(0, 140)}`,
    href: "/admin/facturation",
  });
  return c.json({ data: created }, 201);
});

router.get("/account/closure", async (c) => {
  const actor = await requireActor(c);
  requireRole(actor, ["owner", "manager"]);
  const rows = await getDb()
    .select()
    .from(closureRequests)
    .where(eq(closureRequests.agencyId, actor.organizationId))
    .orderBy(desc(closureRequests.createdAt));
  return c.json({ data: rows });
});

export default router;
