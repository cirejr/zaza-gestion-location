import { and, count, desc, eq, ilike, or } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { getDb } from "@/db";
import { apartments, buildings, claims, tenants } from "@/db/schema";
import { buildingAccessCondition, requireActor, requireRole } from "@/server/lib/auth-context";
import { pagination, parseBody, parseUuid, countValue } from "@/server/lib/http";
import type { ApiEnv } from "@/server/session-middleware";

/**
 * Tenant claims filed from the portal, listed for the owner/manager in charge
 * of the building. Submission lives in `portal.ts`; this router is the staff
 * side: read and triage.
 */
const router = new Hono<ApiEnv>();

const claimStatuses = ["pending", "approved", "rejected"] as const;

async function getClaimForActor(id: string, actor: Awaited<ReturnType<typeof requireActor>>) {
  const db = getDb();
  const [claim] = await db
    .select({ claim: claims, building: buildings })
    .from(claims)
    .innerJoin(buildings, eq(claims.buildingId, buildings.id))
    .where(eq(claims.id, id))
    .limit(1);
  if (!claim) throw new HTTPException(404, { message: "Réclamation introuvable." });
  if (claim.building.organizationId !== actor.organizationId) {
    throw new HTTPException(403, { message: "Vous ne pouvez pas accéder à cette réclamation." });
  }
  return claim.claim;
}

router.get("/claims", async (c) => {
  const actor = await requireActor(c);
  requireRole(actor, ["owner", "manager"]);
  const { page, limit, offset } = pagination(c);
  const conditions = [buildingAccessCondition(actor)];
  const status = c.req.query("status");
  const type = c.req.query("type");
  const q = c.req.query("q")?.trim();
  if (status && claimStatuses.includes(status as (typeof claimStatuses)[number])) {
    conditions.push(eq(claims.status, status));
  }
  if (type && ["deposit", "reparation", "autre"].includes(type)) {
    conditions.push(eq(claims.type, type));
  }
  if (q) {
    conditions.push(
      or(ilike(claims.title, `%${q}%`), ilike(claims.description, `%${q}%`), ilike(tenants.fullName, `%${q}%`), ilike(buildings.name, `%${q}%`))!,
    );
  }
  const where = and(...conditions);
  const db = getDb();
  const base = db
    .select({ claim: claims, building: buildings, apartment: apartments, tenant: tenants })
    .from(claims)
    .innerJoin(buildings, eq(claims.buildingId, buildings.id))
    .leftJoin(apartments, eq(claims.apartmentId, apartments.id))
    .innerJoin(tenants, eq(claims.tenantId, tenants.id));
  const countBase = db
    .select({ total: count() })
    .from(claims)
    .innerJoin(buildings, eq(claims.buildingId, buildings.id))
    .innerJoin(tenants, eq(claims.tenantId, tenants.id));
  const [data, countRows] = await Promise.all([
    base.where(where).orderBy(desc(claims.createdAt)).limit(limit).offset(offset),
    countBase.where(where),
  ]);
  return c.json({ data, pagination: { page, limit, total: countValue(countRows) } });
});

router.patch("/claims/:id", async (c) => {
  const actor = await requireActor(c);
  requireRole(actor, ["owner", "manager"]);
  const id = parseUuid(c.req.param("id"), "claim id");
  await getClaimForActor(id, actor);
  const data = await parseBody(c, z.object({ status: z.enum(claimStatuses) }));
  const [claim] = await getDb().update(claims).set({ status: data.status }).where(eq(claims.id, id)).returning();
  return c.json({ data: claim });
});

router.delete("/claims/:id", async (c) => {
  const actor = await requireActor(c);
  requireRole(actor, ["owner"]);
  const id = parseUuid(c.req.param("id"), "claim id");
  await getClaimForActor(id, actor);
  await getDb().delete(claims).where(eq(claims.id, id));
  return c.body(null, 204);
});

export default router;
